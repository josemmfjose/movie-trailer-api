type FnWithDeps = (dep: never) => unknown
type Injectable = { [key: string]: Injectable | FnWithDeps }

type Fn<T> = T extends () => infer F
  ? { arg: never; return: F }
  : T extends (dep: infer D) => infer F
    ? { arg: D; return: F }
    : never

type Inject<T extends Injectable> = {
  [K in keyof T]: T[K] extends FnWithDeps
    ? Fn<T[K]>['return']
    : T[K] extends Injectable
      ? Inject<T[K]>
      : never
}

type InjectedDeps<T extends Injectable | FnWithDeps> = T extends FnWithDeps
  ? Fn<T>['arg']
  : {
      [K in keyof T]: T[K] extends Injectable | FnWithDeps ? InjectedDeps<T[K]> : never
    }[keyof T]

type UnionToIntersection<Union> = (
  Union extends unknown ? (distributedUnion: Union) => void : never
) extends (mergedIntersection: infer Intersection) => void
  ? Intersection & Union
  : never

type PrettyDeep<T> = T extends unknown
  ? {
      [K in keyof T]: T[K] extends Record<string, unknown> ? PrettyDeep<T[K]> : T[K]
    }
  : never

export const inject =
  <
    const T extends Injectable,
    const D = PrettyDeep<UnionToIntersection<InjectedDeps<T>>>,
    const R = PrettyDeep<Inject<T>>,
  >(
    obj: T,
  ) =>
  (deps: D): R => {
    const result = {} as R
    for (const key in obj) {
      const value = obj[key]
      if (value) {
        // biome-ignore lint: runtime cast needed — D is a computed generic
        result[key as unknown as keyof R] = (
          typeof value === 'function' ? (value as any)(deps) : inject(value)(deps as never)
        ) as R[keyof R]
      }
    }
    return result
  }
