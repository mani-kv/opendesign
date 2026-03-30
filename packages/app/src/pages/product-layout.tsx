import { useParams } from "@solidjs/router"
import type { ParentProps } from "solid-js"
import { ProductScopeProvider } from "@/context/product-scope"

export default function ProductLayout(props: ParentProps) {
  const params = useParams()
  return (
    <ProductScopeProvider productId={params.productId ?? ""} featureId={params.featureId}>
      {props.children}
    </ProductScopeProvider>
  )
}
