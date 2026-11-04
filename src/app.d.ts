import type { Customer } from '$lib/server/customers';

declare global {
	namespace App {
		interface Locals {
			device: string;
			/** Null until the person enters an active code or comes from a customer network. */
			customer: Customer | null;
		}
	}
}

export {};
