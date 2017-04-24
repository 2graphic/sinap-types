import { Type, Value } from ".";

describe("speed", () => {
    it("test 1", () => {
        for (let x = 0; x < 100; x++) {
            const env = new Value.Environment();
            const tstring = new Type.Primitive("string");
            const tnumber = new Type.Primitive("number");
            const tmap = new Value.MapType(tstring, tstring);
            const tobj = new Type.CustomObject("Obj", null, new Map<string, Type.Type>([["string", tstring], ["map", tmap], ["number", tnumber]]));

            const v1 = new Value.CustomObject(tobj, env);

            for (let y = 0; y < 50; y++) {
                v1.set("number", new Value.Primitive(tnumber, env, y));
            }

            for (let z = 0; z < 50; z++) {
                (v1.get("map") as Value.MapObject).set(new Value.Primitive(tstring, env, z.toString()), new Value.Primitive(tstring, env, z + "00"));
            }
        }
    });
});