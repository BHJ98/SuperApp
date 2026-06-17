import {
  lazy,
  Suspense,
  createElement,
  type ComponentType,
  type ReactNode,
} from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = any;
type Loader = () => Promise<{ default: ComponentType<AnyProps> }>;
type Options = { ssr?: boolean; loading?: () => ReactNode };

// Drop-in replacement for next/dynamic, backed by React.lazy + a local
// Suspense boundary so a loading chart doesn't suspend the whole page. The
// `ssr` option is accepted and ignored (this is a client-only SPA). Props are
// intentionally loose (`any`) — this is a thin compatibility shim.
export function dynamic(loader: Loader, options?: Options): ComponentType<AnyProps> {
  const Lazy = lazy(loader);
  const fallback = options?.loading ? options.loading() : null;
  return function DynamicComponent(props: AnyProps) {
    return createElement(Suspense, { fallback }, createElement(Lazy, props));
  };
}

export default dynamic;
