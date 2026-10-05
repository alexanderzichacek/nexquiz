import { formatPin } from "@nexquiz/shared";
import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { format, sk } from "@/i18n/sk";
import LandingPage from "@/landing/LandingPage.vue";
import { useAuthStore } from "@/stores/auth";

declare module "vue-router" {
  interface RouteMeta {
    /** Page name for `<title>`: `NexQuiz – {title}`. */
    title?: string;
    requiresHost?: boolean;
  }
}

/** Host pages live in one lazy-loaded chunk that players never download. */
const loadHost = () => import("@/host");

const routes: RouteRecordRaw[] = [
  { path: "/", name: "landing", component: LandingPage },
  {
    path: "/host",
    meta: { requiresHost: true },
    children: [
      {
        path: "",
        name: "host-quizzes",
        component: () => loadHost().then((m) => m.HostQuizListPage),
        meta: { title: sk.titles.host },
      },
      {
        path: "quizzes/:id",
        name: "host-editor",
        component: () => loadHost().then((m) => m.HostEditorPage),
        meta: { title: sk.titles.editor },
      },
      {
        path: "games/:id/results",
        name: "host-results",
        component: () => loadHost().then((m) => m.HostResultsPage),
        meta: { title: sk.titles.results },
      },
      {
        path: "games/:pin(\\d{6})",
        name: "host-game",
        component: () => loadHost().then((m) => m.HostGamePage),
      },
    ],
  },
  {
    path: "/play",
    name: "play",
    component: () => import("@/play/PlayPage.vue"),
    meta: { title: sk.titles.play },
    beforeEnter: (to) => (typeof to.query.pin === "string" && to.query.pin !== "" ? true : { name: "landing" }),
  },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  if (to.matched.some((r) => r.meta.requiresHost)) {
    const auth = useAuthStore();
    if (!(await auth.ensure())) return { name: "landing" };
  }
  return true;
});

router.afterEach((to) => {
  const pin = typeof to.params.pin === "string" ? to.params.pin : undefined;
  const title = pin ? format(sk.titles.game, { pin: formatPin(pin) }) : to.meta.title;
  document.title = title ? `${sk.brand.name}${sk.titles.separator}${title}` : sk.brand.name;
});
