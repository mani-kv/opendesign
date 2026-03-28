import { createContext, useContext, type Accessor } from "solid-js"
import { useParams, useSearchParams } from "@solidjs/router"

export type ProductScope = {
  productId: Accessor<string>
  featureId: Accessor<string | undefined>
  agentId: Accessor<string | undefined>
  scopeKey: Accessor<string>
}

const ProductScopeContext = createContext<ProductScope | null>(null)

export function ProductScopeProvider(props: {
  productId: string
  featureId?: string
  children: import("solid-js").JSX.Element
}) {
  const [searchParams] = useSearchParams()
  const scope: ProductScope = {
    productId: () => props.productId,
    featureId: () => props.featureId,
    agentId: () => searchParams.agent as string | undefined,
    scopeKey: () => `${props.productId}${props.featureId ? "/" + props.featureId : ""}`,
  }
  return <ProductScopeContext.Provider value={scope}>{props.children}</ProductScopeContext.Provider>
}

export function useProductScope(): ProductScope {
  const scope = useContext(ProductScopeContext)
  if (scope) return scope

  const params = useParams()
  const [searchParams] = useSearchParams()
  return {
    productId: () => params.productId ?? "",
    featureId: () => params.featureId,
    agentId: () => searchParams.agent as string | undefined,
    scopeKey: () => `${params.productId ?? ""}${params.featureId ? "/" + params.featureId : ""}`,
  }
}

export function useProductParams() {
  const scope = useProductScope()
  return {
    get productId() {
      return scope.productId()
    },
    get featureId() {
      return scope.featureId()
    },
    get agentId() {
      return scope.agentId()
    },
  }
}
