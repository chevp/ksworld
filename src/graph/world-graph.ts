import type { Action } from '../model/action.js';
import type { Agent } from '../model/agent.js';
import type { Capability } from '../model/capability.js';
import type { Content } from '../model/content.js';
import type { Data } from '../model/data.js';
import type { Lab } from '../model/lab.js';
import type { Launcher } from '../model/launcher.js';
import type { Layout } from '../model/layout.js';
import type { Order } from '../model/order.js';
import type { Recipe } from '../model/recipe.js';
import type { Ref } from '../model/refs.js';
import { formatRef } from '../model/refs.js';
import type { Request } from '../model/request.js';
import type { Technique } from '../model/technique.js';
import type { TechniqueRun } from '../model/techniqueRun.js';
import type { Workflow } from '../model/workflow.js';
import type { DependencyEdge } from './dependency.js';

export type WorldObject =
  | Lab
  | Technique
  | Workflow
  | Recipe
  | Agent
  | Action
  | Order
  | Request
  | Data
  | Launcher
  | Content
  | Layout
  | TechniqueRun
  | Capability;

/**
 * In-memory graph built from the parsed / indexed projection of `labs/**`
 * (doc §1). Disposable, never authoritative — rebuilt by persistence/index.ts.
 */
export class WorldGraph {
  private readonly objects = new Map<string, WorldObject>();
  private readonly edgesByFrom = new Map<string, DependencyEdge[]>();
  private readonly edgesByTo = new Map<string, DependencyEdge[]>();

  addObject(ref: Ref, obj: WorldObject): void {
    this.objects.set(formatRef(ref), obj);
  }

  addEdge(edge: DependencyEdge): void {
    const fromKey = formatRef(edge.from);
    const toKey = formatRef(edge.to);
    const fromList = this.edgesByFrom.get(fromKey) ?? [];
    fromList.push(edge);
    this.edgesByFrom.set(fromKey, fromList);
    const toList = this.edgesByTo.get(toKey) ?? [];
    toList.push(edge);
    this.edgesByTo.set(toKey, toList);
  }

  resolve<T extends WorldObject = WorldObject>(ref: Ref): T | undefined {
    return this.objects.get(formatRef(ref)) as T | undefined;
  }

  has(ref: Ref): boolean {
    return this.objects.has(formatRef(ref));
  }

  edgesFrom(ref: Ref): DependencyEdge[] {
    return this.edgesByFrom.get(formatRef(ref)) ?? [];
  }

  edgesTo(ref: Ref): DependencyEdge[] {
    return this.edgesByTo.get(formatRef(ref)) ?? [];
  }

  allRefs(): Ref[] {
    return [...this.objects.keys()].map((key) => {
      const dot = key.indexOf('.');
      return { kind: key.slice(0, dot), id: key.slice(dot + 1) } as Ref;
    });
  }

  allObjects(): WorldObject[] {
    return [...this.objects.values()];
  }
}
