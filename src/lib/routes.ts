/** Public routes for the two content collections. */
export const ARTICLES_PATH = '/articles';
export const PROJECTS_PATH = '/projects';

export function articleHref(id: string): string {
  return `${ARTICLES_PATH}/${id}`;
}

export function projectHref(id: string): string {
  return `${PROJECTS_PATH}/${id}`;
}
