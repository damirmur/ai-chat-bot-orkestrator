import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';

try { loadEnvFile(); } catch (e) { }

const LM_URL = process.env.LM_STUDIO_URL?.replace(/\/$/, '') || 'http://localhost:1234';
const LM_API_TOKEN = process.env.LM_STUDIO_API_KEY || 'lm-studio';

const MODEL_CONFIG = {
    key: process.env.LM_MODEL_KEY || 'qwen3.5-9b',
    contextLength: parseInt(process.env.LM_CONTEXT_LENGTH) || 65536,
    parallel: parseInt(process.env.LM_PARALLEL) || 4,
    gpuOffload: process.env.LM_GPU_OFFLOAD || '1'
};

function log(msg) {
    console.log(`[LM Manager] ${msg}`);
}

function logError(msg) {
    console.error(`[LM Manager] ❌ ${msg}`);
}

async function checkServer() {
    try {
        const res = await fetch(`${LM_URL}/v1/models`, {
            headers: { 'Authorization': `Bearer ${LM_API_TOKEN}` }
        });
        return res.ok;
    } catch {
        return false;
    }
}

function getLoadedModels() {
    return new Promise((resolve) => {
        const proc = spawn('lms', ['ps', '--json'], { shell: true });
        let stdout = '';
        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.on('close', () => {
            try {
                const models = JSON.parse(stdout);
                log(`Загруженные модели: ${models.map(m => `${m.identifier} (ctx:${m.contextLength}, parallel:${m.parallel})`).join(', ')}`);
                resolve(models);
            } catch {
                resolve([]);
            }
        });
        proc.on('error', () => resolve([]));
    });
}

async function unloadModel(identifier) {
    return new Promise((resolve) => {
        const proc = spawn('lms', ['unload', identifier], { shell: true });
        proc.on('close', (code) => {
            if (code === 0) {
                log(`Модель ${identifier} выгружена`);
                resolve(true);
            } else {
                logError(`Ошибка выгрузки ${identifier}`);
                resolve(false);
            }
        });
    });
}

function loadModel() {
    return new Promise((resolve, reject) => {
        const args = [
            'load', MODEL_CONFIG.key,
            '-c', MODEL_CONFIG.contextLength.toString(),
            '--parallel', MODEL_CONFIG.parallel.toString(),
            '--gpu', MODEL_CONFIG.gpuOffload,
            '-y'
        ];

        log(`Загрузка: lms ${args.join(' ')}`);
        
        const proc = spawn('lms', args, { shell: true });
        
        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (code) => {
            if (code === 0) {
                log(`Модель ${MODEL_CONFIG.key} загружена`);
                resolve(true);
            } else {
                logError(`Ошибка загрузки: ${stderr || stdout}`);
                reject(new Error(stderr || stdout || 'Ошибка lms load'));
            }
        });

        proc.on('error', (err) => {
            logError(`spawn error: ${err.message}`);
            reject(err);
        });
    });
}

function modelMatchesConfig(model) {
    const matches = 
        model.contextLength === MODEL_CONFIG.contextLength &&
        model.parallel === MODEL_CONFIG.parallel &&
        model.identifier.includes(MODEL_CONFIG.key);
    
    if (!matches) {
        log(`Параметры модели ${model.identifier}: ctx=${model.contextLength}/${MODEL_CONFIG.contextLength}, parallel=${model.parallel}/${MODEL_CONFIG.parallel}`);
    }
    return matches;
}

export async function ensureModelReady() {
    log('Проверка LM Studio...');

    const serverReady = await checkServer();
    if (!serverReady) {
        logError('LM Studio API недоступен. Запустите LM Studio');
        throw new Error('LM Studio не запущен');
    }

    log('Сервер доступен');

    const loaded = await getLoadedModels();
    
    // Ищем нашу модель
    const ourModel = loaded.find(m => m.identifier.includes(MODEL_CONFIG.key));
    const otherModels = loaded.filter(m => !m.identifier.includes(MODEL_CONFIG.key));

    // Выгружаем лишние
    if (otherModels.length > 0) {
        log(`Выгружаю лишние модели: ${otherModels.map(m => m.identifier).join(', ')}`);
        for (const m of otherModels) {
            await unloadModel(m.identifier);
        }
    }

    // Проверяем параметры или загружаем
    if (ourModel) {
        if (modelMatchesConfig(ourModel)) {
            log(`Модель ${MODEL_CONFIG.key} уже загружена с правильными параметрами`);
            return true;
        } else {
            log('Параметры не совпадают, перезагружаю...');
            await unloadModel(ourModel.identifier);
            await loadModel();
            return true;
        }
    }

    log(`Загрузка модели ${MODEL_CONFIG.key}...`);
    await loadModel();
    log('Модель готова');
    return true;
}