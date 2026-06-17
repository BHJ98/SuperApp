import { Link as RouterLink } from "react-router-dom";
import type { ComponentProps } from "react";

type RouterLinkProps = ComponentProps<typeof RouterLink>;

// next/link compatibility shim: maps `href` onto react-router's `to`.
export default function Link({
  href,
  ...rest
}: Omit<RouterLinkProps, "to"> & { href: string }) {
  return <RouterLink to={href} {...rest} />;
}
