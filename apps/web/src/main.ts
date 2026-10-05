import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { setUnauthorizedHandler } from "./lib/api";
import { router } from "./router";
import { useAuthStore } from "./stores/auth";
import "./styles/tokens.css";
import "./styles/base.css";

const app = createApp(App).use(createPinia()).use(router);

// An expired host session sends the host back to the landing page.
setUnauthorizedHandler(() => {
  useAuthStore().setAuthenticated(false);
  if (router.currentRoute.value.matched.some((r) => r.meta.requiresHost)) void router.push({ name: "landing" });
});

app.mount("#app");
