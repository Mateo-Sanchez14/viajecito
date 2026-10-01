// One import line per message file, alphabetical. A milestone appends its own file here.
import { mergeMessages } from "../merge";
import auth from "./auth.json";
import common from "./common.json";
import errors from "./errors.json";
import home from "./home.json";
import ops from "./ops.json";
import ski from "./ski.json";
import trips from "./trips.json";

export default mergeMessages(auth, common, errors, home, ops, ski, trips);
