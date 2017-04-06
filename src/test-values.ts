/// <reference path="../typings/index.d.ts" />

import { expect } from "chai";
import { Type, Value } from ".";

describe("Values", () => {
    it("deps", () => {
        const env = new Value.Environment();
        const n1 = new Value.Primitive(new Type.Primitive("number"), env, 1);
        const n10 = new Value.Primitive(new Type.Primitive("number"), env, 10);

        env.add(n1);
        env.add(n10);

        const value: Value.Value = {
            uuid: "1",
            environment: env,
            computeDependencies: () => [],
            dependencyParents: new Set(),
            dependencyChildren: new Set(),
            context: {},
            deepEqual: () => false,
            type: new Type.Literal(1),
            serialRepresentation: [
                env.toReference(n1),
                { k: { v: env.toReference(n10) } }]
        };
        env.add(value);
        const deps = Value.Value.prototype.computeDependencies.call(value);
        expect(deps).to.deep.equal([n1, n10]);
    });

    describe("literals and primitives", () => {
        it("unions init literals as literals", () => {
            const t = new Type.Union([new Type.Literal("hi")]);
            const v = new Value.Union(t, new Value.Environment());
            expect(v.value).to.instanceof(Value.Literal);
            expect((v.value as Value.Literal).value).to.equal("hi");
        });

        it("literals", () => {
            const env = new Value.Environment();
            const t1 = new Type.Literal(1);
            const l1 = new Value.Literal(t1, env);
            expect(l1.serialRepresentation).to.equal(1);

            const tHello = new Type.Literal("hello");
            const lHello = new Value.Literal(tHello, env);
            expect(lHello.serialRepresentation).to.equal("hello");
        });

        it("primitives", () => {
            const env = new Value.Environment();
            const tNumber = new Type.Primitive("number");
            const pNumber = new Value.Primitive(tNumber, env, 17);
            expect(pNumber.serialRepresentation).to.equal(17);
            pNumber.value = 14;
            expect(pNumber.serialRepresentation).to.equal(14);

            const tColor = new Type.Primitive("color");
            const pColor = new Value.Primitive(tColor, env);
            expect(pColor.value).to.equal("#ffff00");

            const tFile = new Type.Primitive("file");
            const pFile = new Value.Primitive(tFile, env);
            expect(pFile.value).to.equal("NO FILE");
        });
    });

    describe("Records", () => {
        it("simple", () => {
            const env = new Value.Environment();
            const t = new Type.Record("r1", new Map([["l", new Type.Primitive("number")]]));
            const v = new Value.Record(t, env);
            expect(v.serialRepresentation.l.kind).to.deep.equal("value-reference");
            expect(v.serialRepresentation.l).to.have.property("uuid");
            const l = v.value.l;
            expect(l instanceof Value.Primitive && l.value).to.equal(0);
        });
    });

    describe("Intersections", () => {
        it("Handle the basics", () => {
            const env = new Value.Environment();
            const tnumber = new Type.Primitive("number");
            const tA = new Type.CustomObject("A", null, new Map([["foo", tnumber]]));
            const tB = new Type.CustomObject("B", null, new Map([["bar", tnumber]]));
            const tInter = new Type.Intersection([tA, tB]);

            const v = new Value.Intersection(tInter, env);

            const n15 = new Value.Primitive(tnumber, env, 15);
            const n16 = new Value.Primitive(tnumber, env, 16);
            v.set("foo", n15);
            v.set("bar", n16);

            expect(v.serialRepresentation).to.deep.equal({
                foo: env.toReference(n15),
                bar: env.toReference(n16),
            });

            expect(v.get("foo")).to.equal(n15);
        });

        it("handles arrays", () => {
            const tnumber = new Type.Primitive("number");
            const tA = new Type.CustomObject("A", null, new Map([["foo", tnumber]]));
            const tB = new Type.CustomObject("B", null, new Map([["bar", tnumber]]));
            const tAArray = new Value.ArrayType(tA);
            const tBArray = new Value.ArrayType(tB);

            const inter = Type.intersectTypes([tAArray, tBArray], []) as Value.ArrayType;

            expect(inter).to.be.instanceof(Value.ArrayType);
            expect(inter.typeParameter).to.be.instanceof(Type.Intersection);
            const param = inter.typeParameter as Type.Intersection;
            expect(param.equals(new Type.Intersection([tA, tB]))).to.be.true;
        });

        it("handles mutual dependency", () => {
            const tA = new Type.CustomObject("A", null, new Map());
            const tB = new Type.CustomObject("B", null, new Map([["a", tA]]));
            tA.members.set("b", tB);

            const inter = new Type.Intersection([tA, tB]);
            expect(inter.members.get("a")).to.equal(tA);
            expect(inter.members.get("b")).to.equal(tB);
        });

        it("handles cyclic dependency", () => {
            const tB1 = new Type.CustomObject("B1", null, new Map());
            const tB2 = new Type.CustomObject("B2", null, new Map());

            const tA1 = new Type.CustomObject("A1", null, new Map([["bs", new Value.ArrayType(tB1)]]));
            const tA2 = new Type.CustomObject("A2", null, new Map([["bs", new Value.ArrayType(tB2)]]));

            tB1.members.set("a", tA1);
            tB2.members.set("a", tA2);

            // this used to infinitely recur
            const inter = new Type.Intersection([tA1, tA2]);

            expect(((inter.members.get("bs") as Value.ArrayType).typeParameter as Type.Intersection).members.get("a")!.equals(inter)).to.be.true;
        });

        it("can call methods", () => {
            const env = new Value.Environment();
            const tnumber = new Type.Primitive("number");
            const tA = new Type.CustomObject("A", null, new Map([["foo", tnumber]]), new Map([["foobar", {
                argTypes: [],
                returnType: null,
                implementation: function(this: Value.CustomObject) {
                    (this.get("foo") as Value.Primitive).value = 17;
                },
            }]]));
            const tB = new Type.CustomObject("B", null, new Map([["bar", tnumber]]));
            const tInter = new Type.Intersection([tA, tB]);

            const v = new Value.Intersection(tInter, env);

            const n15 = new Value.Primitive(tnumber, env, 15);
            const n16 = new Value.Primitive(tnumber, env, 16);
            v.set("foo", n15);
            v.set("bar", n16);

            v.call("foobar");

            expect(v.serialRepresentation).to.deep.equal({
                foo: env.toReference(n15),
                bar: env.toReference(n16),
            });

            expect(n15.value).to.equal(17);
        });
    });

    describe("Custom Objects", () => {
        it("Map", () => {
            const env = new Value.Environment();
            const tnumber = new Type.Primitive("number"), tstring = new Type.Primitive("string");
            const v = new Value.MapObject(new Value.MapType(tnumber, tstring), env);
            const v1 = new Value.Primitive(tnumber, env, 1);
            const vHello = new Value.Primitive(tstring, env, "Hello");
            v.set(v1, vHello);
            const rep = v.serialRepresentation;
            expect(rep).to.deep.equal([[env.toReference(v1), env.toReference(vHello)]]);
        });

        describe("method manager", () => {
            it("can call a function", () => {
                const env = new Value.Environment();
                const tnumber = new Type.Primitive("number");
                const tA = new Type.CustomObject("A", null, new Map([["foo", tnumber]]), new Map([
                    ["func", {
                        argTypes: [tnumber],
                        returnType: null,
                        implementation: function(this: Value.CustomObject, a: Value.Value) {
                            this.set("foo", a);
                        }
                    }]
                ]));

                const a = new Value.CustomObject(tA, env);
                env.add(a);
                const prim = new Value.Primitive(tnumber, env, 17);
                a.call("func", prim);

                expect(a.serialRepresentation)
                    .to.deep.equal({ foo: env.toReference(prim) });

                const prim2 = new Value.Primitive(tnumber, env, 14);
                a.set("foo", prim2);
                expect(a.serialRepresentation)
                    .to.deep.equal({ foo: env.toReference(prim2) });

                expect(a.get("foo").serialRepresentation).to.equal(14);
            });
            it("can get/set values", () => {
                const env = new Value.Environment();
                const tnumber = new Type.Primitive("number");
                const tA = new Type.CustomObject("A", null, new Map([["foo", tnumber]]));
                const a = new Value.CustomObject(tA, env);

                const prim = new Value.Primitive(tnumber, env, 14);
                a.set("foo", prim);
                expect(a.serialRepresentation)
                    .to.deep.equal({ foo: env.toReference(prim) });

                expect(a.get("foo").serialRepresentation).to.equal(14);
            });
            it("can get a return value", () => {
                const env = new Value.Environment();
                const tnumber = new Type.Primitive("number"), tstring = new Type.Primitive("string");
                const tA = new Type.CustomObject("A", null, new Map([["foo", tnumber]]), new Map([
                    ["func", {
                        argTypes: [],
                        returnType: tstring,
                        implementation: function(this: any) {
                            return new Value.Primitive(tstring, env, "Hi");
                        }
                    }]
                ]));
                const a = new Value.CustomObject(tA, env);
                const result = a.call("func")!;

                expect(result.serialRepresentation)
                    .to.equal("Hi");
            });
        });
    });

    describe("deep equal", () => {
        const tnumber = new Type.Primitive("number"), tstring = new Type.Primitive("string");
        const trec1 = new Type.Record("rec1", new Map([["a", tnumber]]));
        it("equates primitives", () => {
            const env = new Value.Environment();
            const n1a = new Value.Primitive(tnumber, env, 1);
            const n1b = new Value.Primitive(tnumber, env, 1);
            const n2 = new Value.Primitive(tnumber, env, 2);
            const sAa = new Value.Primitive(tstring, env, "A");
            const sAb = new Value.Primitive(tstring, env, "A");
            const sB = new Value.Primitive(tstring, env, "B");

            expect(n1a.deepEqual(n1a)).to.be.true;
            expect(n1a.deepEqual(n1b)).to.be.true;
            expect(n1a.deepEqual(n2)).to.be.false;

            expect(sAa.deepEqual(sAa)).to.be.true;
            expect(sAa.deepEqual(sAb)).to.be.true;
            expect(sAa.deepEqual(sB)).to.be.false;

            expect(n1a.deepEqual(sB)).to.be.false;
        });
        it("equates records", () => {
            const env = new Value.Environment();
            const n1a = new Value.Primitive(tnumber, env, 1);
            const n1b = new Value.Primitive(tnumber, env, 1);
            const n2 = new Value.Primitive(tnumber, env, 2);

            const r1aa = new Value.Record(trec1, env);
            const r1ab = new Value.Record(trec1, env);
            const r1b = new Value.Record(trec1, env);
            const r2 = new Value.Record(trec1, env);

            r1aa.value.a = n1a;
            r1ab.value.a = n1a;
            r1b.value.a = n1b;
            r2.value.a = n2;

            // checks if deep equal works even through different uuids
            expect(r1aa.deepEqual(r1aa)).to.be.true;
            expect(r1aa.deepEqual(r1ab)).to.be.true;
            expect(r1aa.deepEqual(r1b)).to.be.true;
            expect(r1aa.deepEqual(r2)).to.be.false;
        });

        it("short circuits", () => {
            const env = new Value.Environment();
            const n1 = new Value.Primitive(tnumber, env, 1);
            const n2 = new Value.Primitive(tnumber, env, 2);
            (n1 as any).uuid = "1";
            (n2 as any).uuid = "1";

            expect(n1.deepEqual(n2)).to.be.true;
        });

        it("short circuits (deep)", () => {
            const env = new Value.Environment();
            const n1 = new Value.Primitive(tnumber, env, 1);
            const n2 = new Value.Primitive(tnumber, env, 2);
            const r1 = new Value.Record(trec1, env);
            const r2 = new Value.Record(trec1, env);

            (n1 as any).uuid = "1";
            (n2 as any).uuid = "1";

            r1.value.a = n1;
            r2.value.a = n2;

            expect(n1.deepEqual(n2)).to.be.true;
        });

        it("short circuits (deep) (helper)", () => {
            // (validate that it is the matching UUIDs doing it)
            const env = new Value.Environment();
            const n1 = new Value.Primitive(tnumber, env, 1);
            const n2 = new Value.Primitive(tnumber, env, 2);
            const r1 = new Value.Record(trec1, env);
            const r2 = new Value.Record(trec1, env);

            r1.value.a = n1;
            r2.value.a = n2;

            expect(n1.deepEqual(n2)).to.be.false;
        });
    });

    describe("listeners", () => {
        function listenForTheseChanges(env: Value.Environment, listenRoot: Value.Value, done: () => void, changesExpected: [Value.Value, any][]) {
            // set up a listener
            let stepNumber = 0;
            env.listen((root, value, other) => {
                const specificChanges = changesExpected.shift();
                if (!specificChanges) {
                    throw new Error("got unexpected changes");
                }

                const [vExpected, oExpected] = specificChanges;

                expect(root).to.equal(listenRoot, `Roots match up. Step number ${stepNumber}`);
                expect(value).to.equal(vExpected, `Values match up. Step number ${stepNumber}`);
                expect(other).to.deep.equal(oExpected, `Changes match up. Step number ${stepNumber}`);
                stepNumber++;

                if (changesExpected.length === 0) {
                    done();
                }
            }, () => true, listenRoot);
        }

        const tnumber = new Type.Primitive("number");
        const trec1 = new Type.Record("rec1", new Map([["a", tnumber]]));
        const trec2 = new Type.Record("rec2", new Map([["b", trec1]]));
        const trec3 = new Type.Record("rec3", new Map([["c", trec2]]));
        it("primitives", (done) => {
            const env = new Value.Environment();
            const n1 = new Value.Primitive(tnumber, env, 17);
            env.add(n1);

            listenForTheseChanges(env, n1, done, [
                [n1, { from: 17, to: 7 }],
            ]);

            n1.value = 7;
        });

        it("unions", (done) => {
            const env = new Value.Environment();
            const n1 = new Value.Union(new Type.Union([tnumber]), env);
            env.add(n1);

            listenForTheseChanges(env, n1, done, [
                [n1.value, { from: 0, to: 7 }],
            ]);

            (n1.value as Value.Primitive).value = 7;
        });

        it("records", (done) => {
            const env = new Value.Environment();
            const r1 = new Value.Record(trec1, env);
            env.add(r1);

            listenForTheseChanges(env, r1, done, [
                [r1.value.a, { from: 0, to: 7 }],
            ]);

            (r1.value.a as Value.Primitive).value = 7;
        });

        it("records (deep)", (done) => {
            const env = new Value.Environment();
            const r = new Value.Record(trec3, env);
            env.add(r);

            const r2 = r.value.c as Value.Record;
            const r3 = r2.value.b as Value.Record;
            const p = r3.value.a as Value.Primitive;

            listenForTheseChanges(env, r, done, [
                [p, { from: 0, to: 7 }],
            ]);

            p.value = 7;
        });

        it("untracks correctly", (done) => {
            const env = new Value.Environment();
            const m = new Value.MapObject(new Value.MapType(tnumber, tnumber), env);
            const n1 = new Value.Primitive(new Type.Primitive("number"), env, 1);
            const n17 = new Value.Primitive(new Type.Primitive("number"), env, 17);
            const n18 = new Value.Primitive(new Type.Primitive("number"), env, 18);
            env.add(m);

            // have n17 as a dependency
            m.set(n1, n17);

            // set up a listener
            listenForTheseChanges(env, m, done, [
                [m, { from: n17, to: n18, key: n1 }],
                [n18, { from: 18, to: 3 }],
            ]);

            // remove n17 as a dep and add n18
            m.set(n1, n18);

            // update n17, this should not notify
            n17.value = 14;

            // update n18, this should notify
            n18.value = 3;
        });

        it("records squash", (done) => {
            const env = new Value.Environment();
            const r = new Value.Record(trec3, env);
            env.add(r);

            const rOrginalChild = (r.value as any).c.value.b.value.a as Value.Record;

            listenForTheseChanges(env, r, done, [
                [rOrginalChild, { from: 0, to: 7 }],
            ]);

            const r2 = new Value.Record(trec2, env);
            const r1 = r2.value.b as Value.Record;
            (r1.value.a as Value.Primitive).value = 7;
            r.value.c = r2;
        });

        it("map", (done) => {
            const env = new Value.Environment();
            const m = new Value.MapObject(new Value.MapType(tnumber, tnumber), env);
            const n1 = new Value.Primitive(new Type.Primitive("number"), env, 1);
            const n17 = new Value.Primitive(new Type.Primitive("number"), env, 17);
            env.add(m);

            listenForTheseChanges(env, m, done, [
                [m, { from: undefined, key: n1, to: n17 }],
            ]);

            m.set(n1, n17);
        });

        it("map2", (done) => {
            const env = new Value.Environment();
            const m = new Value.MapObject(new Value.MapType(tnumber, tnumber), env);
            const n1 = new Value.Primitive(new Type.Primitive("number"), env, 1);
            const n17 = new Value.Primitive(new Type.Primitive("number"), env, 17);
            env.add(m);

            m.set(n1, n17);

            listenForTheseChanges(env, m, done, [
                [n17, { from: 17, to: 14 }],
            ]);

            n17.value = 14;
        });

        it("untracks deep", (done) => {
            // be careful when editing this test
            // it is designed to much around with the internals of
            // the way tracking works at a fairly deep level (mutliple levels
            // of indirection) with the premise that optimizations
            // to the the change deptector might break some of these cases

            const env = new Value.Environment();
            const tm3 = new Value.MapType(tnumber, tnumber);
            const tm2 = new Value.MapType(tnumber, tm3);
            const tm1 = new Value.MapType(tnumber, tm2);

            const m1 = new Value.MapObject(tm1, env);
            const m2_a = new Value.MapObject(tm2, env);
            const m2_b = new Value.MapObject(tm2, env);
            const m3_a = new Value.MapObject(tm3, env);
            const m3_b = new Value.MapObject(tm3, env);
            const m3_c = new Value.MapObject(tm3, env);
            const nA = new Value.Primitive(new Type.Primitive("number"), env, 1);
            const nB = new Value.Primitive(new Type.Primitive("number"), env, 4);
            const nC = new Value.Primitive(new Type.Primitive("number"), env, 17);
            const nD = new Value.Primitive(new Type.Primitive("number"), env, 18);
            env.add(m1);

            listenForTheseChanges(env, m1, done, [
                [m1, { from: undefined, to: m2_a, key: nA }],   // 0
                [m2_a, { from: undefined, to: m3_a, key: nC }], // 1
                [m3_a, { from: undefined, to: nA, key: nD }],   // 2
                [nA, { from: 1, to: 2 }],                       // 3
                [m3_a, { from: nA, to: nC, key: nD }],          // 4
                [nA, { from: 2, to: 3 }],                       // 5
                [m3_a, { from: nC, to: nB, key: nD }],          // 6
                [nB, { from: 4, to: 5 }],                       // 7
                [m3_a, { from: nB, to: nA, key: nD }],          // 8
                [nA, { from: 3, to: 1 }],                       // 9
                [m3_a, { from: nA, to: nB, key: nD }],          // 10
                [nB, { from: 6, to: 7 }],                       // 11
                [m2_a, { from: m3_a, to: m3_b, key: nC }],      // 12
                [nA, { from: 1, to: 0 }],                       // 13
                [m1, { from: m2_a, to: m2_b, key: nA }],        // 14
                [nA, { from: 0, to: 103 }],                     // 15
            ]);

            m1.set(nA, m2_a);       // 0
            m2_a.set(nC, m3_a);     // 1
            m3_a.set(nD, nA);       // 2
            nA.value = 2;           // 3
            m3_a.set(nD, nC);       // 4
            // n1 is still being tracked via the key on m3
            nA.value = 3;           // 5
            m3_a.set(nD, nB);       // 6
            nB.value = 5;           // 7
            m3_a.set(nD, nA);       // 8
            // this should not update, n4 is no longer in any way associated with m3
            nB.value = 6;           // no-change
            nA.value = 1;           // 9
            m3_a.set(nD, nB);       // 10
            nB.value = 7;           // 11
            m2_a.set(nC, m3_b);     // 12
            // this should not update, n4 is no longer in any way associated with m3
            nB.value = 8;           // no-change
            nA.value = 0;           // 13
            m3_c.set(nA, nA);       // no-change
            m2_b.set(nA, m3_c);     // no-change
            m1.set(nA, m2_b);       // 14
            nB.value = 100;         // no-change
            nC.value = 101;         // no-change
            nD.value = 102;         // no-change
            nA.value = 103;         // 15
        });
    });
    describe("garbage collect", () => {
        it("removes untracked objects", () => {
            const env = new Value.Environment();
            const hello = Value.makePrimitive(env, "hello");
            const world = Value.makePrimitive(env, "world");
            env.add(hello);
            env.add(world);
            expect(env.values.has(hello.uuid)).to.be.true;
            expect(env.values.has(world.uuid)).to.be.true;
            env.garbageCollect([hello]);
            expect(env.values.has(hello.uuid)).to.be.true;
            expect(env.values.has(world.uuid)).to.be.false;
        });
        it("handles recursion", () => {
            const env = new Value.Environment();
            const stringType = new Type.Primitive("string");
            const mapSS = new Value.MapType(stringType, stringType);
            const mapSmSS = new Value.MapType(stringType, mapSS);
            const map2 = new Value.MapObject(mapSmSS, env);
            const map1 = new Value.MapObject(mapSS, env);

            const hello = Value.makePrimitive(env, "hello");
            const world = Value.makePrimitive(env, "world");
            const woah = Value.makePrimitive(env, "woah");
            const nonRefed = Value.makePrimitive(env, "i don't matter?");

            env.add(map1);
            map1.set(hello, world);
            env.add(map2);
            map2.set(woah, map1);
            env.add(nonRefed);

            function checkPresence(items: Iterable<[Value.Value, boolean]>) {
                for (const [item, beThere] of items) {
                    expect(env.values.has(item.uuid)).to.equal(beThere);
                }
            }

            const items = new Map<Value.Value, boolean>([
                [world, true],
                [hello, true],
                [woah, true],
                [map1, true],
                [map2, true],
                [nonRefed, true],
            ]);

            checkPresence(items);
            env.garbageCollect([map2]);
            items.set(nonRefed, false);
            checkPresence(items);
        });
        it("handles cycles", () => {
            const A = new Type.CustomObject("A", null, new Map());
            const B = new Type.CustomObject("B", null, new Map());
            const env = new Value.Environment();

            A.members.set("b", B);
            B.members.set("a", A);

            const a1 = new Value.CustomObject(A, env);
            const b1 = new Value.CustomObject(B, env);

            env.add(a1);
            a1.set("b", b1);
            b1.set("a", a1);

            expect(env.values.has(a1.uuid)).to.be.true;
            expect(env.values.has(b1.uuid)).to.be.true;

            env.garbageCollect([a1]);

            expect(env.values.has(a1.uuid)).to.be.true;
            expect(env.values.has(b1.uuid)).to.be.true;
        });
    });

    describe("initialize", () => {
        it("initializes primitives", () => {
            const env = new Value.Environment();
            const p1 = new Value.Primitive(new Type.Primitive("string"), env);
            expect(p1.value).to.equal("");
        });
        it("initializes records", () => {
            const env = new Value.Environment();
            const p1 = new Value.Record(new Type.Record("rec1", new Map<string, Type.Type>([
                ["hello", new Type.Primitive("string")],
                ["world", new Value.ArrayType(new Type.Primitive("number"))]
            ])), env);

            expect(p1.value.hello).to.instanceof(Value.Primitive);
            expect((p1.value.hello as Value.Primitive).value).to.equal("");
            expect(p1.value.world).to.instanceof(Value.ArrayObject);
            expect([...(p1.value.world as Value.ArrayObject)]).to.deep.equal([]);

        });

        it("initializes CustomObject", () => {
            const env = new Value.Environment();
            const p1 = new Value.CustomObject(new Type.CustomObject("rec1", null, new Map([
                ["hello", new Type.Primitive("number")]
            ])), env);

            p1.initialize();

            expect(p1.get("hello")).to.instanceof(Value.Primitive);
            expect((p1.get("hello") as Value.Primitive).value).to.equal(0);
        });

        it("initializes Intersection", () => {
            const env = new Value.Environment();

            const i1 = new Value.Intersection(new Type.Intersection([new Type.CustomObject("rec1", null, new Map([
                ["hello", new Type.Primitive("number")]
            ]))]), env);

            i1.initialize();

            expect(i1.get("hello")).to.instanceof(Value.Primitive);
            expect((i1.get("hello") as Value.Primitive).value).to.equal(0);
        });

        it("initializes Union", () => {
            const env = new Value.Environment();

            const u1 = new Value.Union(new Type.Union(
                [
                    new Type.Literal("hello"),
                    new Type.Literal("abc"),
                ]
            ), env);
            env.add(u1);

            expect(u1.value).to.instanceof(Value.Literal);
            expect((u1.value as Value.Literal).value).to.equal("hello");

            env.garbageCollect([u1]);
            expect(env.values.size).to.equal(2);
            expect([...env.values.values()]).to.contain(u1);
            expect([...env.values.values()]).to.contain(u1.value);
        });
    });
});