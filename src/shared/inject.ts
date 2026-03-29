import type { UnionToIntersection } from 'type-fest'

// biome-ignore lint: any needed for generic DI
type Fn = (...args: any[]) => any
type InjectableLeaf = Fn
type InjectableNode = { [key: string]: InjectableLeaf | InjectableNode }
type Injectable = InjectableNode

type Inject<T extends Injectable> = {
  [K in keyof T]: T[K] extends Fn
    ? ReturnType<T[K]>
    : T[K] extends Injectable
      ? Inject<T[K]>
      : never
}

type InjectedDeps<T extends Injectable> = {
  [K in keyof T]: T[K] extends (deps: infer D) => unknown
    ? D
    : T[K] extends Injectable
      ? InjectedDeps<T[K]>
      : never
}[keyof T]

export const inject =
  <const T extends Injectable>(obj: T) =>
  (deps: UnionToIntersection<InjectedDeps<T>>): Inject<T> => {
    const result = {} as Record<string, unknown>
    for (const key in obj) {
      const value = obj[key]
      if (typeof value === 'function') {
        result[key] = (value as Fn)(deps)
      } else if (typeof value === 'object' && value !== null) {
        result[key] = inject(value as Injectable)(deps as never)
      }
    }
    return result as Inject<T>
  }
