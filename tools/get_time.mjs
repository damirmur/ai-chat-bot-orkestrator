// Removed functions: logError, executeCommand, getTimestamp

import { log } from '../logger.mjs';
import * as temporalPolyfill from 'temporal-polyfill';

export const definition = {
	name: 'get_time',
	description: 'Gets the current system time.',
	requiredInputs: [],
	optionalInputs: [],
	outputs: {
		currentTime: 'string'
	},
	canExtractFrom: [],
	type: 'function',
	function: {
		get_system_time() {
			const currentTime = temporalPolyfill.Instant.now().toString();
			log(`[get_time] Current time: ${currentTime}`);
			return { currentTime };
		}
	}
};

export const handler = async (inputs) => {
	const result = definition.function.get_system_time();
	return result;
};
