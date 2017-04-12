import { Type, Value } from ".";
import { expect } from "chai";

describe("Deserialization", () => {
    it("calls whenHas once exists", (done) => {
        const env = new Value.Environment();
        let counter = 0;
        env.whenHas("some-uuid", (v: Value.Value) => {
            expect(v).to.equal(n1);
            counter++;
            if (counter > 1) {
                done();
            }
        });
        env.whenHas("some-uuid", (v: Value.Value) => {
            expect(v).to.equal(n1);
            counter++;
            if (counter > 1) {
                done();
            }
        });

        const n1 = new Value.Primitive(new Type.Primitive("number"), env, 1);
        (n1 as any).uuid = "some-uuid";
        env.add(n1);
    });

    it("calls whenHas immediately", (done) => {
        const env = new Value.Environment();
        const n1 = new Value.Primitive(new Type.Primitive("number"), env, 1);
        (n1 as any).uuid = "some-uuid";
        env.add(n1);
        env.whenHas("some-uuid", (v: Value.Value) => {
            expect(v).to.equal(n1);
            done();
        });
    });

    it("deserializes primitives", () => {
        const env = new Value.Environment();
        const v = env.fromSerial(new Type.Primitive("number"), 9, "9-9-9-9-9-9-9-9");

        expect(v).to.instanceof(Value.Primitive);
        expect(v.serialRepresentation).to.equal(9);
    });

    it("deserializes literals", () => {
        const env = new Value.Environment();
        const v = env.fromSerial(new Type.Literal(15), 9, "15-15-15-15");

        expect(v).to.instanceof(Value.Literal);
        expect(v.uuid).to.equal("15-15-15-15");
        expect(v.serialRepresentation).to.equal(15);
    });

    it("deserializes records", () => {
        const env = new Value.Environment();

        const v2 = env.fromSerial(new Type.Record("rec1", new Map([[
            "hi", new Type.Literal(15)
        ]])), {
                hi: { "kind": "value-reference", "uuid": "15-15-15-15" }
            }, "record-record") as Value.Record;

        const v1 = env.fromSerial(new Type.Literal(15), 9, "15-15-15-15");

        expect(v1).to.instanceof(Value.Literal);
        expect(v1.serialRepresentation).to.equal(15);

        expect(v2).to.instanceof(Value.Record);
        expect(v2.value.hi).to.equal(v1);
    });

    it("deserializes cyclic objects", () => {
        const env = new Value.Environment();

        const t = new Type.CustomObject("Obj1", null, new Map([["hi", new Type.Literal(15)]]));
        t.members.set("otherObj", t);

        const v1 = env.fromSerial(new Type.Literal(15), 9, "15-15-15-15");

        const v2 = env.fromSerial(t, {
            hi: { "kind": "value-reference", "uuid": "15-15-15-15" },
            otherObj: { "kind": "value-reference", "uuid": "object-3" }
        }, "object-2") as Value.CustomObject;

        const v3 = env.fromSerial(t, {
            hi: { "kind": "value-reference", "uuid": "15-15-15-15" },
            otherObj: { "kind": "value-reference", "uuid": "object-2" }
        }, "object-3") as Value.CustomObject;


        expect(v2).to.instanceof(Value.CustomObject);
        expect(v2.get("hi")).to.equal(v1);

        expect(v3).to.instanceof(Value.CustomObject);
        expect(v3.get("hi")).to.equal(v1);

        expect((v2 as Value.CustomObject).get("otherObj")).equals(v3);
        expect((v3 as Value.CustomObject).get("otherObj")).equals(v2);
    });

    it("deserializes intersections", () => {
        const env = new Value.Environment();

        const t1 = new Type.CustomObject("Obj1", null, new Map([["hi", new Type.Literal(15)]]));
        const t2 = new Type.CustomObject("Obj1", null, new Map([["hey", new Type.Literal(15)]]));
        const t = new Type.Intersection([t1, t2]);

        const v1 = env.fromSerial(new Type.Literal(15), 9, "15-15-15-15");

        const v2 = env.fromSerial(t, {
            hi: { "kind": "value-reference", "uuid": "15-15-15-15" },
            hey: { "kind": "value-reference", "uuid": "15-15-15-15" },
        }, "object-2") as Value.CustomObject;

        expect(v2).to.instanceof(Value.CustomObject);
        expect(v2.get("hi")).to.equal(v1);
        expect(v2.get("hey")).to.equal(v1);
    });

    it("deserializes Arrays", () => {
        const env = new Value.Environment();

        const t = new Value.ArrayType(new Type.Primitive("number"));

        const n9 = env.fromSerial(new Type.Primitive("number"), 9, "9-9-9-9");
        const n15 = env.fromSerial(new Type.Primitive("number"), 15, "15-15-15-15");

        const v2 = env.fromSerial(t, [], "object-2") as Value.ArrayObject;

        expect(v2).to.instanceof(Value.ArrayObject);
        expect(v2.length).to.equal(0);

        const v3 = env.fromSerial(t, [
            { kind: "value-reference", uuid: "15-15-15-15" },
            { kind: "value-reference", uuid: "9-9-9-9" },
        ], "object-2") as Value.ArrayObject;

        expect(v3).to.instanceof(Value.ArrayObject);
        expect(v3.length).to.equal(2);
        expect([...v3]).to.deep.equal([n15, n9]);
    });

    it("deserializes Maps", () => {
        const env = new Value.Environment();

        const t = new Value.MapType(new Type.Primitive("number"), new Type.Primitive("string"));

        const n9 = env.fromSerial(new Type.Primitive("number"), 9, "9-9-9-9");
        const n15 = env.fromSerial(new Type.Primitive("number"), 15, "15-15-15-15");

        const s9 = env.fromSerial(new Type.Primitive("string"), "9", "s-9-9-9-9");
        const s15 = env.fromSerial(new Type.Primitive("string"), "15", "s-15-15-15-15");

        const v2 = env.fromSerial(t, [], "object-2") as Value.MapObject;

        expect(v2).to.instanceof(Value.MapObject);
        expect([...v2].length).to.equal(0);

        const v3 = env.fromSerial(t, [
            [{ kind: "value-reference", uuid: "15-15-15-15" }, { kind: "value-reference", uuid: "s-15-15-15-15" }],
            [{ kind: "value-reference", uuid: "9-9-9-9" }, { kind: "value-reference", uuid: "s-9-9-9-9" }],
        ], "object-2") as Value.MapObject;

        expect(v3).to.instanceof(Value.MapObject);
        expect([...v3]).to.deep.equal([[n15, s15], [n9, s9]]);
    });

    it("deserializes Sets", () => {
        const env = new Value.Environment();

        const t = new Value.SetType(new Type.Primitive("number"));

        const n9 = env.fromSerial(new Type.Primitive("number"), 9, "9-9-9-9");
        const n15 = env.fromSerial(new Type.Primitive("number"), 15, "15-15-15-15");

        const v2 = env.fromSerial(t, [], "object-2") as Value.SetObject;

        expect(v2).to.instanceof(Value.SetObject);
        expect([...v2].length).to.equal(0);

        const v3 = env.fromSerial(t, [
            { kind: "value-reference", uuid: "15-15-15-15" },
            { kind: "value-reference", uuid: "9-9-9-9" },
        ], "object-2") as Value.SetObject;

        expect(v3).to.instanceof(Value.SetObject);
        expect([...v3]).to.deep.equal([n15, n9]);
    });

    it("deserializes Unions", () => {
        const env = new Value.Environment();

        const t = new Type.Union([new Type.Primitive("number")]);
        const n9 = env.fromSerial(new Type.Primitive("number"), 9, "9-9-9-9");
        const v2 = env.fromSerial(t, { kind: "value-reference", uuid: "9-9-9-9" }, "object-2") as Value.Union;

        expect(v2).to.instanceof(Value.Union);
        expect(v2.value).to.equal(n9);
    });
});