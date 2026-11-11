/**
 * Runs tasks one at a time. `before` runs ahead of every task (e.g. waiting for
 * storage and refreshing the tab cache). A failed task does not block later ones.
 */
export function createSerialQueue(before) {
    let tail = Promise.resolve();

    return (task) => {
        const result = tail.then(before).then(task);

        tail = result.catch(() => {});

        return result;
    };
}
