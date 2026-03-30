import { describe, expect, it } from 'vitest'
import { inject } from '#shared/inject'

describe('inject', () => {
  it('resolves single-level functions with deps', () => {
    const module = inject({
      greet: (deps: { name: string }) => `hello ${deps.name}`,
    })

    const resolved = module({ name: 'world' })
    expect(resolved.greet).toBe('hello world')
  })

  it('resolves nested modules recursively', () => {
    const module = inject({
      outer: {
        inner: (deps: { x: number }) => deps.x * 2,
      },
    })

    const resolved = module({ x: 5 })
    expect(resolved.outer.inner).toBe(10)
  })

  it('passes the full deps object to each function', () => {
    const module = inject({
      sum: (deps: { a: number; b: number }) => deps.a + deps.b,
      product: (deps: { a: number; b: number }) => deps.a * deps.b,
    })

    const resolved = module({ a: 3, b: 4 })
    expect(resolved.sum).toBe(7)
    expect(resolved.product).toBe(12)
  })

  it('functions can return other functions (curried DI)', () => {
    const module = inject({
      add: (deps: { base: number }) => (n: number) => deps.base + n,
    })

    const resolved = module({ base: 10 })
    expect(resolved.add(5)).toBe(15)
  })

  it('handles deeply nested modules', () => {
    const module = inject({
      level1: {
        level2: {
          value: (deps: { v: string }) => deps.v.toUpperCase(),
        },
      },
    })

    const resolved = module({ v: 'deep' })
    expect(resolved.level1.level2.value).toBe('DEEP')
  })
})
