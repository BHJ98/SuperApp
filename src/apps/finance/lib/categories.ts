export type CategoryBase = {
  id: string;
  name: string;
  parent_id: string | null;
  color?: string | null;
};

export type CategoryNode = CategoryBase & {
  children: CategoryNode[];
  depth: number;
  fullPath: string;
};

export function buildCategoryTree(categories: CategoryBase[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];

  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [], depth: 0, fullPath: cat.name });
  }

  for (const node of Array.from(map.values())) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function setFullPaths(nodes: CategoryNode[], prefix: string) {
    for (const node of nodes) {
      node.fullPath = prefix ? `${prefix} → ${node.name}` : node.name;
      node.depth = prefix ? prefix.split(" → ").length : 0;
      setFullPaths(node.children, node.fullPath);
    }
  }
  setFullPaths(roots, "");

  return roots;
}

export function flattenTree(nodes: CategoryNode[]): CategoryNode[] {
  const result: CategoryNode[] = [];
  function walk(list: CategoryNode[]) {
    for (const node of list) {
      result.push(node);
      walk(node.children);
    }
  }
  walk(nodes);
  return result;
}

export function getAllChildIds(categories: CategoryBase[], categoryId: string): Set<string> {
  const childIds = new Set<string>();
  function collect(id: string) {
    childIds.add(id);
    for (const cat of categories) {
      if (cat.parent_id === id) collect(cat.id);
    }
  }
  collect(categoryId);
  return childIds;
}
