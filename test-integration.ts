import { expect } from "chai";
import { Type } from ".";
import { Value } from ".";
import { deepCopy } from "./util";

function dereferencePrimitives(serialRep: any, env: Value.Environment) {
    return deepCopy(serialRep, (v) => {
        if (v.kind === "value-reference") {
            const value = env.fromReference(v);
            if (value instanceof Value.Primitive) {
                return { replace: true, value: value.value };
            } else {
                return { replace: true, value: v };
            }
        }
        return { replace: false };
    });
}

describe("Integration", () => {
    const stringType = new Type.Primitive("string");
    const booleanType = new Type.Primitive("boolean");

    it("DFA", () => {
        const nodeType = new Type.CustomObject("DFANode", null, new Map<string, Type.Type>([
            ["label", stringType],
            ["isAcceptState", booleanType],
            ["isStartState", booleanType],
            ["children", "placeholder" as any],
        ]), undefined, new Map([
            ["isAcceptState", "Accept State"],
            ["isStartState", "Start State"],
        ]));

        const edgeType = new Type.CustomObject("DFANode", null, new Map<string, Type.Type>([
            ["label", stringType],
            ["destination", nodeType],
        ]));

        const stateType = new Type.CustomObject("State", null, new Map<string, Type.Type>([
            ["currentNode", nodeType],
            ["inputLeft", stringType],
        ]));


        nodeType.members.set("children", new Value.ArrayType(edgeType));

        const graphType = new Type.CustomObject("DFAGraph", null, new Map<string, Type.Type>([
            ["nodes", new Value.ArrayType(nodeType)],
            ["edges", new Value.ArrayType(edgeType)],
        ]));

        const env = new Value.Environment();
        const node1 = new Value.CustomObject(nodeType, env);
        env.add(node1);
        const node2 = new Value.CustomObject(nodeType, env);
        env.add(node2);
        const edge1 = new Value.CustomObject(edgeType, env);
        env.add(edge1);
        edge1.set("destination", node2);
        edge1.set("label", new Value.Primitive(stringType, env, "1"));
        const childArray = new Value.ArrayObject(new Value.ArrayType(edgeType), env);
        node1.set("children", childArray);
        node1.set("label", new Value.Primitive(stringType, env, "q1"));
        node1.set("isAcceptState", new Value.Primitive(booleanType, env, false));
        node1.set("isStartState", new Value.Primitive(booleanType, env, true));
        node2.set("children", new Value.ArrayObject(new Value.ArrayType(edgeType), env));
        node2.set("label", new Value.Primitive(stringType, env, "q2"));
        node2.set("isAcceptState", new Value.Primitive(booleanType, env, true));
        node2.set("isStartState", new Value.Primitive(booleanType, env, false));
        childArray.push(edge1);

        const edgesArray = new Value.ArrayObject(new Value.ArrayType(edgeType), env);
        const nodesArray = new Value.ArrayObject(new Value.ArrayType(nodeType), env);
        edgesArray.push(edge1);
        nodesArray.push(node1);
        nodesArray.push(node2);

        const graph = new Value.CustomObject(graphType, env);
        env.add(graph);
        graph.set("nodes", nodesArray);
        graph.set("edges", edgesArray);

        const longWayNode1 = [...(graph as any).get("nodes")].filter(v => v.get("label").value === "q1")[0];
        expect(longWayNode1).to.equal(node1);
        expect(longWayNode1.get("children").index(0)).to.equal(edge1);
        expect(longWayNode1.get("children").index(0).get("label").value).to.equal("1");
        expect(longWayNode1.get("children").index(0).get("destination")).to.equal(node2);

        function start(graph: Value.CustomObject, input: Value.Primitive): Value.Value {
            const nodes = graph.get("nodes") as Value.ArrayObject;
            const startStates = [...nodes].filter(v => ((v as Value.CustomObject).get("isStartState") as Value.Primitive).value);
            if (startStates.length !== 1) {
                throw new Error(`must have exactly 1 start state, found: ${startStates.length}`);
            }

            const state = new Value.CustomObject(stateType, env);
            state.set("currentNode", startStates[0]);
            state.set("inputLeft", input);
            return state;
        }

        function step(state: Value.CustomObject): Value.Value {
            const currentNodeV = state.get("currentNode") as Value.CustomObject;
            const inputLeftV = state.get("inputLeft") as Value.Primitive;
            const inputLeft = inputLeftV.value as string;
            if (inputLeft.length === 0) {
                return currentNodeV.get("isAcceptState");
            }

            const nextToken = inputLeft[0];

            const possibleEdgesV = currentNodeV.get("children") as Value.ArrayObject;

            const possibleEdges = [...possibleEdgesV]
                .filter(v => ((v as Value.CustomObject).get("label") as Value.Primitive).value === nextToken);

            if (possibleEdges.length === 0) {
                return new Value.Primitive(booleanType, env, false);
            }
            if (possibleEdges.length > 1) {
                throw new Error(`must have 0 or 1 possible edges, found: ${possibleEdges.length}`);
            }

            const newState = new Value.CustomObject(stateType, env);
            newState.set("currentNode", (possibleEdges[0] as Value.CustomObject).get("destination"));
            newState.set("inputLeft", new Value.Primitive(stringType, env, inputLeft.substr(1)));
            return newState;
        }

        {
            const state1 = start(graph, new Value.Primitive(stringType, env, "1")) as Value.CustomObject;
            expect(dereferencePrimitives(state1.serialRepresentation, env))
                .to.deep.equal({ "currentNode": env.toReference(node1), inputLeft: "1" });

            const state2 = step(state1) as Value.CustomObject;
            expect(dereferencePrimitives(state2.serialRepresentation, env))
                .to.deep.equal({ "currentNode": env.toReference(node2), inputLeft: "" });

            const result = step(state2) as Value.Primitive;
            expect(result.value).to.equal(true);
        }

        {
            const state1 = start(graph, new Value.Primitive(stringType, env, "11")) as Value.CustomObject;
            const state2 = step(state1) as Value.CustomObject;
            const result = step(state2) as Value.Primitive;
            expect(result.value).to.equal(false);
        }
        {
            const state1 = start(graph, new Value.Primitive(stringType, env, "")) as Value.CustomObject;
            const result = step(state1) as Value.Primitive;
            expect(result.value).to.equal(false);
        }
        {
            const state1 = start(graph, new Value.Primitive(stringType, env, "0")) as Value.CustomObject;
            const result = step(state1) as Value.Primitive;
            expect(result.value).to.equal(false);
        }
    });
});