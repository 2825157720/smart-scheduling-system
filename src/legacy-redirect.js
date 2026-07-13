const TARGET_HOSTNAME = "paiban.2825157720.workers.dev";

export default {
  fetch(request) {
    const target = new URL(request.url);
    target.protocol = "https:";
    target.hostname = TARGET_HOSTNAME;
    target.port = "";
    return Response.redirect(target, 308);
  },
};
