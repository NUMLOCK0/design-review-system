type BackRouter = {
  back: () => void;
  replace: (href: string) => void;
};

export function goBackOrReplace(router: BackRouter, fallbackHref: string) {
  if (window.history.length > 1) {
    router.back();
    return;
  }

  router.replace(fallbackHref);
}
