/** Error raised for every failed platform call. `status` is 0 when the platform could not be reached at all. */
export class PlatformError extends Error {
    status: number;
    code: string;

    constructor(message: string, status: number, code: string) {
        super(message);
        this.name = 'PlatformError';
        this.status = status;
        this.code = code;
    }

    get isNetwork(): boolean {
        return this.status === 0;
    }

    get isUnauthorised(): boolean {
        return this.status === 401;
    }
}

export const ON_A_RUN_MESSAGE = 'Finish your current run first';

export function isPlatformError(error: unknown): error is PlatformError {
    return error instanceof PlatformError;
}

/** A message that is safe to show a driver for any thrown value. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.'): string {
    if (error instanceof PlatformError) return error.message;
    if (error instanceof Error && error.message) return error.message;
    return fallback;
}
