/** 尊重用户的动效偏好 —— 每个动画组件在启用动效前必须检查它。 */
export function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
