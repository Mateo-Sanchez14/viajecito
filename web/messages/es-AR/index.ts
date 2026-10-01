// One import line per message file, alphabetical, and one argument line per file below.
// A milestone appends its own import and its own argument line (keeps merges conflict-free).
import { mergeMessages } from "../merge";
import auth from "./auth.json";
import common from "./common.json";
import dates from "./dates.json";
import errors from "./errors.json";
import home from "./home.json";
import ops from "./ops.json";
import proposals from "./proposals.json";
import push from "./push.json";
import pwa from "./pwa.json";
import ski from "./ski.json";
import trips from "./trips.json";
import map from "./map.json";

export default mergeMessages(
  auth,
  common,
  dates,
  errors,
  home,
  ops,
  proposals,
  push,
  pwa,
  ski,
  trips,
  map,
);
