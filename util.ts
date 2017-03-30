export function mapEquivalent<K, V>(a: Map<K, V>, b: Map<K, V>, equals: (a: V, b: V) => boolean) {
    if (a.size !== b.size) {
        return false;
    }
    for (const [k, v] of a.entries()) {
        if (!b.has(k)) {
            return false;
        }
        if (!equals(v, b.get(k)!)) {
            return false;
        }
    }
    return true;
}

export function setEquivalent<V>(a: Set<V>, b: Set<V>): boolean {
    if (a.size !== b.size) {
        return false;
    }
    for (const c of a.values()) {
        if (!b.has(c)) {
            return false;
        }
    }
    return true;
}

export function traverse(serial: any, visit: (a: any, path: (string | number)[]) => boolean, existingPath: (string | number)[] = []) {
    if (!visit(serial, existingPath)) {
        return;
    }
    if (typeof (serial) === "object") {
        for (const key in serial) {
            traverse(serial[key], visit, existingPath.concat([key]));
        }
    }
}

export function deepCopy(serial: any, visit: (a: any) => { replace: boolean, value?: any }): any {
    const visitValue = visit(serial);
    if (visitValue.replace) {
        return visitValue.value;
    }
    if (typeof (serial) === "object") {
        if (Array.isArray(serial)) {
            return serial.map((v) => deepCopy(v, visit));
        } else {
            const result: any = {};
            for (const key in serial) {
                result[key] = deepCopy(serial[key], visit);
            }
            return result;
        }
    } else {
        return serial;
    }
}

/**
 * Check whether a == b, with a chance to control the equality test via comparitor.
 *
 * Should not be used on circular objects
 *
 * @param a
 * @param b
 * @param comparitor should return true or false if result of equality is known, should return "recurse"
 * if you want deepEqual to recurse and check
 */
export function deepEqual(a: any, b: any, comparitor: (a: any, b: any) => true | false | "recurse"): boolean {
    const comparison = comparitor(a, b);
    if (comparison === true || comparison === false) {
        return comparison;
    }

    if (typeof (a) !== "object" || typeof (b) !== "object") {
        return a === b;
    }

    // make sure `a` has all b's keys
    for (const key in b) {
        if (b[key]) {
            if (!a[key]) {
                return false;
            }
        }
    }

    for (const key in a) {
        if (!deepEqual(a[key], b[key], comparitor)) {
            return false;
        }
    }

    return true;
}