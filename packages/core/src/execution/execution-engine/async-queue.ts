/**
 * A push-based async iterable, for forwarding values produced inside a plain
 * callback out through an enclosing async generator. Iteration yields buffered
 * values as they arrive and ends once {@link AsyncQueue.close} is called and the
 * buffer has drained.
 */
export type AsyncQueue<T> = {
    push: (item: T) => void;
    close: () => void;
    [Symbol.asyncIterator]: () => AsyncGenerator<T>;
};

export function createAsyncQueue<T>(): AsyncQueue<T> {
    const buffer: T[] = [];
    let closed = false;
    let wake: (() => void) | undefined;

    const signal = () => {
        wake?.();
        wake = undefined;
    };

    return {
        push(item) {
            buffer.push(item);
            signal();
        },
        close() {
            closed = true;
            signal();
        },
        async *[Symbol.asyncIterator]() {
            while (true) {
                while (buffer.length > 0) {
                    yield buffer.shift() as T;
                }
                if (closed) return;
                // Assigned synchronously, so a `push`/`close` cannot slip in
                // between the check above and this wait.
                await new Promise<void>((resolve) => {
                    wake = resolve;
                });
            }
        },
    };
}
