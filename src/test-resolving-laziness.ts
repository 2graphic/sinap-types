import { expect } from "chai";
import { Type, Value } from ".";

describe("Resolve Laziness", () => {
    it("serializes a tuple", () => {
        const env = new Value.Environment();
        const tt = new Value.TupleType([new Type.Primitive("string")]);
        const tv = new Value.TupleObject(tt, env);
        expect(tv.dependencyChildren.size).to.equal(1);
    });
});