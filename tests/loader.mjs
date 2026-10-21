export async function resolve(specifier, context, nextResolve) {
  const clean = specifier.replace(/\?.*$/, '');
  return nextResolve(clean, context);
}
