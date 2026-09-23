#!/usr/bin/env node
/**
 * A SERVER ACTION AND A ROUTER REFRESH IN THE SAME MODULE DROP THE UPDATE
 * (nc#1286).
 *
 * The pairing is the defect, and neither half looks wrong on its own. A server
 * action answers with the re-rendered tree for the path it revalidated; the
 * router's `refresh()` asks for that same tree again. Two answers for one page,
 * and the client applies one of them.
 *
 * MEASURED, on a probe page rendering one written value server-side, clicking
 * only a HYDRATED control, in a `next start` production build (Next 15.5.24,
 * React 19.1, Chromium). A round counts as landed when the page shows the new
 * value; every round's write was re-read from the server afterwards and had
 * committed in every case, including the ones that never showed:
 *
 *   server action, then router.refresh() inside useTransition   89/100
 *   server action, then router.refresh() outside it              18/20
 *   server action alone, revalidating the current path           80/80
 *   <form action={serverAction}> + revalidatePath                68/70
 *   <form action={serverAction}> ending in redirect()            20/20
 *   plain form POST to a route handler answering 303             70/70
 *   plain fetch() to a route handler, then router.refresh()      30/30
 *
 * The last line is why this bans a pairing rather than a call. A refresh after
 * a `fetch` is the shape `app/journal`'s reflection and `app/run`'s queue drain
 * use, and it did not drop a single update. What drops is a refresh asked for
 * on top of an action's own answer.
 *
 * THE RULE. A client module that holds a runtime reference to a server action
 * must not also call the router's `refresh()`. If the page the action was
 * called from needs to update, revalidate that path in the action --
 * `revalidatePath("/world")` in `setWorld` is the worked example -- or post a
 * plain form to a route handler that answers 303, which is what
 * `app/api/world-memory/retire/route.ts` does and what nc#949 landed on.
 *
 * -- WHY THIS ASKS TYPESCRIPT, AFTER SEVENTEEN FINDINGS SAID THE SAME THING --
 *
 * Five versions of this guard tried to answer the question themselves. Three
 * matched text and Codex found a hole in each within minutes (#1289); the
 * fourth and fifth parsed the file and built a scope stack by hand, and review
 * found ten more on #1295. Seventeen findings across eight rounds, and every
 * one of them is one sentence:
 *
 *     this file re-implemented TypeScript's binder and module resolver,
 *     and it is not TypeScript.
 *
 *   binder rules it got wrong:   `var` is function-scoped; a switch body is one
 *                                scope; a parameter shadows an import; a
 *                                reassignment merges provenance across
 *                                branches; two identifiers of one spelling are
 *                                not one binding; a helper written above the
 *                                declaration it closes over still sees it
 *   resolver rules it got wrong: `"./actions.js"` resolves to `actions.ts`; a
 *                                barrel re-exports in one statement, in two, or
 *                                as a default; a mixed barrel carries the
 *                                BINDING, not the module
 *   erasure rules it got wrong:  an import used only as a type is erased; an
 *                                `extends` expression runs although it sits
 *                                inside a type node
 *
 * There is a symbol table two lines away that is right about all of them, so
 * this asks it. `ts.createProgram` over the repository's own tsconfig costs
 * ~4s here, in a CI job that already spends ~118s in `next build`.
 *
 * WHAT THE CHECKER REPLACES, AND WHY EACH IS NOW STRUCTURAL RATHER THAN FIXED
 *
 *   the scope stack      -> SYMBOL IDENTITY. A symbol is already
 *                           scope-resolved, so shadowing, `var` hoisting, a
 *                           switch clause's own binding and a helper above its
 *                           declaration are not cases this file can get wrong;
 *                           they are not cases it can see.
 *   specifier resolution -> getAliasedSymbol. It follows a barrel, a default
 *                           re-export, a two-statement re-export and a `.js`
 *                           specifier to the declaration itself, and it carries
 *                           the imported BINDING, so a mixed barrel's ordinary
 *                           helper is not an action.
 *   provenance merging   -> a symbol that was EVER assigned the hook's result
 *                           is a router. `if (x) router = cache;` keeps it one,
 *                           which is the branch-merging answer with no branch
 *                           model.
 *
 * WHAT IT FOLLOWS, none of which it has a rule for any more
 *
 *   every spelling of the binding: renamed, annotated, destructured, aliased
 *   every spelling of the call: `.refresh()`, `["refresh"]()`, on the hook call
 *   every route to the action: direct, barrel, default, `.js`, mixed
 *   every scope: block, function, switch clause, helper above its declaration
 *
 * WHAT IT STILL CANNOT SEE, and says so rather than implying otherwise.
 *
 * A router or an action that leaves the module as a VALUE -- stored on an
 * object, passed to another function, reached through a dynamic `import()` --
 * is beyond a symbol read. A local alias is followed, to a fixed point, because
 * that is one hop and a binder can answer it; anything further wants a value
 * analysis this deliberately does not build.
 *
 * It no longer judges only the files that DECLARE `"use client"`. A helper with
 * no directive of its own, imported by a client entry, is part of the client
 * bundle -- Next ships it to the browser, it drops updates exactly as #1286
 * measured, and every spelling above is available to it. So the judged set is
 * what the entries REACH (nc#1296); see `clientReachableFiles`.
 *
 * What the walk still cannot see, and says so rather than implying otherwise:
 * a module named by a specifier that is not a literal (`import(name)`), one
 * reached through `require()`, and one the program does not hold -- the
 * tsconfig excludes `app/sw.ts` and `**\/*.test.ts`, and an unresolvable
 * specifier resolves to nothing at all. Each is a module whose identity is not
 * decidable by a symbol read, which is the same boundary the rest of this file
 * keeps.
 *
 * It catches the shape that has been written twice in this repository and every
 * spelling of it that nine rounds of review have found; it is not a proof of
 * absence.
 */

import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOTS = ["app", "lib"];
const JS_EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs"];

/**
 * Client modules the BUILD compiles but `tsc` does not see.
 *
 * This repository sets `allowJs: false`, so a `app/example.jsx` carrying
 * `"use client"`, a server-action import and a `router.refresh()` is outside
 * the typecheck entirely while Next builds and ships it — it would pass every
 * gate and reach a teacher (Codex, third round on #1295). The program this
 * guard builds takes them as extra roots with `allowJs` on, which changes
 * nothing about `npm run typecheck`: that reads the tsconfig, this reads the
 * tsconfig's options and then asks for more files.
 */
function javascriptModulesUnderRoots() {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(path);
      } else if (JS_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        found.push(path);
      }
    }
  };
  for (const root of ROOTS) if (existsSync(root)) walk(join(process.cwd(), root));
  return found;
}

/** The program the whole check reads, built from the repository's own tsconfig. */
function buildProgram() {
  const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, "tsconfig.json");
  if (!configPath) {
    throw new Error(
      "no tsconfig.json at the repository root. This guard resolves symbols through a real " +
        "TypeScript program; without the project's own options it would be answering a " +
        "different question than the build does."
    );
  }
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  return ts.createProgram({
    rootNames: [...parsed.fileNames, ...javascriptModulesUnderRoots()],
    // `checkJs` stays off: this asks the binder where a name comes from, not
    // the checker whether the file type-checks, and turning it on would make
    // the guard report someone else's diagnostics.
    options: { ...parsed.options, allowJs: true, checkJs: false },
  });
}

const program = buildProgram();
const checker = program.getTypeChecker();

/**
 * Where the check looks, which is not the same as what the program holds.
 *
 * The program carries every file the build does, because that is what resolves
 * an import correctly. The rule is about this repository's own client modules,
 * so the files JUDGED are the ones under `app/` and `lib/`.
 *
 * The extensions come from the program rather than from a list here, and the
 * program is given the JavaScript modules under those roots explicitly, so a
 * `.jsx` client module the build ships is judged although `allowJs: false`
 * keeps it out of `tsc` (#1295).
 */
function judgedFiles() {
  const roots = ROOTS.filter((root) => existsSync(root)).map((root) => join(process.cwd(), root));
  return program
    .getSourceFiles()
    .filter((file) => !file.isDeclarationFile)
    .filter((file) => roots.some((root) => file.fileName.startsWith(`${root}/`)));
}

const isRepositoryModule = (file) =>
  Boolean(file) &&
  !file.isDeclarationFile &&
  !file.fileName.includes("/node_modules/") &&
  file.fileName.startsWith(`${process.cwd()}/`);

/**
 * The source file a module specifier names, asked of the program rather than
 * resolved again here.
 *
 * `getSymbolAtLocation` on the specifier is the same answer the rest of this
 * file relies on, so a `paths` alias, a `.js` specifier and an extensionless
 * directory import land where the build lands. `resolveModuleName` is the
 * fallback for the positions the checker attaches no symbol to -- a dynamic
 * `import()`'s argument among them -- and it is given the program's own
 * options, so it cannot answer a different question than the program would.
 */
function moduleFileOf(specifier, containingFile) {
  if (!specifier || !(ts.isStringLiteral(specifier) || ts.isNoSubstitutionTemplateLiteral(specifier))) {
    return undefined;
  }
  const symbol = checker.getSymbolAtLocation(specifier);
  const declared = (symbol?.declarations ?? []).find((declaration) => ts.isSourceFile(declaration));
  if (declared) return declared;
  const resolved = ts.resolveModuleName(
    specifier.text,
    containingFile.fileName,
    program.getCompilerOptions(),
    ts.sys
  ).resolvedModule;
  return resolved ? program.getSourceFile(resolved.resolvedFileName) : undefined;
}

/**
 * An import declaration NAMES its binding; that is not a use of it, and an
 * import whose binding is never used is erased. All three binding forms have
 * to be excluded, not just the two that were (Codex, #1295).
 */
const isImportBindingSite = (node) =>
  ts.isImportSpecifier(node.parent) ||
  ts.isImportClause(node.parent) ||
  ts.isNamespaceImport(node.parent);

/**
 * The symbols this file uses somewhere that RUNS -- the same question
 * `importedActionModule` asks of one binding, asked once of all of them.
 *
 * A name standing only in a type position is erased with the import that
 * brought it, so it is not a use; neither is the import declaration's own
 * binding site.
 */
function runtimeUsedSymbols(file) {
  const used = new Set();
  const visit = (node) => {
    if (ts.isIdentifier(node) && !isImportBindingSite(node) && !insideTypePosition(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      if (symbol) used.add(symbol);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return used;
}

/**
 * The modules this one pulls into the bundle with it.
 *
 * An import erased before the browser sees anything is not a way into the
 * client bundle -- which is every spelling of erasure, not just the keyword;
 * see `shipsAtRuntime`. This repository does not set `verbatimModuleSyntax`;
 * under it an elided clause is preserved and that function would have to
 * change. A side-effect import (`import "./styles"`) does ship, and carries no
 * binding to read. A dynamic `import()` with a literal
 * specifier is a client chunk rather than an exception -- the CALL is dynamic,
 * the module is not -- so it counts here although a value passing through one
 * remains beyond this file.
 */
function importedModulesOf(file) {
  const found = [];
  const surviving = runtimeUsedSymbols(file);
  const add = (specifier) => {
    const target = moduleFileOf(specifier, file);
    if (isRepositoryModule(target)) found.push(target);
  };

  /**
   * Does this import statement reach the bundle at all?
   *
   * `import type { … }` is the easy half and was the only half read here.
   * `import { type Shape }` sets no flag on the CLAUSE, and an ordinary
   * binding used only in a type position sets none anywhere -- TypeScript
   * elides the whole statement in both cases, so a helper reached only that
   * way is not client code and failing it would be this guard inventing a
   * violation in server-only code (Codex, round 1 on #1323).
   */
  const shipsAtRuntime = (clause) => {
    if (!clause) return true; // `import "./styles.css"` has no binding to erase.
    if (clause.isTypeOnly) return false;
    const locals = [];
    if (clause.name) locals.push(clause.name);
    const named = clause.namedBindings;
    if (named && ts.isNamespaceImport(named)) locals.push(named.name);
    if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) if (!element.isTypeOnly) locals.push(element.name);
    }
    return locals.some((name) => {
      const symbol = checker.getSymbolAtLocation(name);
      return Boolean(symbol && surviving.has(symbol));
    });
  };

  /** A re-export carries its binding on; one that is all types carries none. */
  const reExportShips = (statement) => {
    if (statement.isTypeOnly) return false;
    const clause = statement.exportClause;
    if (clause && ts.isNamedExports(clause)) return clause.elements.some((e) => !e.isTypeOnly);
    return true; // `export * from` and `export * as ns from`
  };

  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (!shipsAtRuntime(statement.importClause)) continue;
      add(statement.moduleSpecifier);
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      if (!reExportShips(statement)) continue;
      add(statement.moduleSpecifier);
    }
  }

  const dynamic = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0
    ) {
      add(node.arguments[0]);
    }
    ts.forEachChild(node, dynamic);
  };
  dynamic(file);
  return found;
}

/**
 * WHAT NEXT SHIPS TO THE BROWSER, which is not what declares that it does.
 *
 * `"use client"` marks a BOUNDARY, not a file: everything the marked module
 * imports crosses it too. So the entries are the files carrying the directive,
 * and the judged set is every repository module reachable from one.
 *
 * Three things fix the shape of the walk, and each is a decision rather than
 * an implementation detail:
 *
 *   WHAT IS AN ENTRY. A file under the judged roots that declares
 *                     `"use client"`. Next has one other way in -- a Server
 *                     Component may hand a client boundary a module -- but
 *                     that module is reached through an import from a marked
 *                     file in every spelling this repository writes, so the
 *                     directive is the entry and reachability does the rest.
 *   WHERE IT STOPS.   At a `"use server"` module. Next keeps an action module
 *                     on the server and hands the client a reference to it, so
 *                     `actions.ts` is a leaf here: it is judged as an action
 *                     module (it cannot pair, it has no router), and its own
 *                     imports -- the database, the session -- are server code
 *                     and are not dragged into the client set behind it.
 *   HOW IT TERMINATES. `reachedFrom` holds every file the walk has queued, so
 *                     a cycle is one visit and a diamond is one visit. Each
 *                     module's imports are read once.
 *
 * The cost rides on the program that is already built: the ~4.9s is
 * `ts.createProgram`, and this adds a breadth-first pass over the modules it
 * already parsed, resolving each specifier through the checker. Measured on
 * this repository it is a few hundred modules and is not visible beside the
 * program build, which is itself not visible beside `next build`'s ~118s.
 *
 * Breadth-first for the diagnostic rather than for the answer: the parent
 * chain a violation prints is then the SHORTEST route from an entry to it,
 * which is the one a reader can follow.
 */
function clientReachableFiles(entries) {
  const reachedFrom = new Map();
  const queue = [];
  for (const entry of entries) {
    if (reachedFrom.has(entry)) continue;
    reachedFrom.set(entry, null);
    queue.push(entry);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const file = queue[index];
    // An action module is where the client bundle ends; see WHERE IT STOPS.
    if (isServerActionModule(file)) continue;
    for (const target of importedModulesOf(file)) {
      if (reachedFrom.has(target)) continue;
      reachedFrom.set(target, file);
      queue.push(target);
    }
  }
  return reachedFrom;
}

/**
 * The shortest route that brought this module into the client bundle: the
 * entry first, then each importer, ending at the module's own importer. The
 * module itself is not repeated — the line above already names it.
 */
function routeToEntry(file, reachedFrom) {
  const route = [];
  for (let current = reachedFrom.get(file); current; current = reachedFrom.get(current)) {
    route.unshift(current);
  }
  return route.map((step) => relative(process.cwd(), step.fileName));
}

/**
 * A directive, read as one rather than as text. A file whose COMMENT mentions
 * `"use server"` is not declaring it, and that is not hypothetical: an early
 * version of this lint flagged the very file whose comment explains the rule.
 */
function hasDirective(file, directive) {
  // The PROLOGUE only. A top-level `"use server"` written after the first real
  // statement is an expression statement and nothing else, and reading it as a
  // directive made an ordinary module an action module — enough to fail a
  // client that imported an ordinary value from it beside a legitimate
  // refresh-after-`fetch` (Codex, #1295).
  for (const statement of file.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false;
    }
    if (statement.expression.text === directive) return true;
  }
  return false;
}

const isServerActionModule = (file) => hasDirective(file, "use server");

/** The symbol a name really stands for, with an import alias followed home. */
function resolve(node) {
  const symbol = node && checker.getSymbolAtLocation(node);
  if (!symbol) return undefined;
  if (symbol.flags & ts.SymbolFlags.Alias) {
    try {
      return checker.getAliasedSymbol(symbol);
    } catch {
      return symbol;
    }
  }
  return symbol;
}

/** Unwrap `x as T`, `x!`, `(x)` — syntax around a value, not a value. */
function unwrap(node) {
  let current = node;
  while (
    current &&
    (ts.isAsExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      (ts.isSatisfiesExpression && ts.isSatisfiesExpression(current)))
  ) {
    current = current.expression;
  }
  return current;
}

/** Is this position erased before it runs? */
function insideTypePosition(node) {
  for (let current = node.parent; current; current = current.parent) {
    // `export type { save as SaveAction }` erases the import entirely, and the
    // specifier's property name still resolves to it (Codex, #1295).
    if (ts.isExportSpecifier(current)) {
      return current.isTypeOnly || current.parent.parent.isTypeOnly === true;
    }
    if (ts.isExportDeclaration(current) && current.isTypeOnly) return true;
    // An `extends` clause is filed under a type node and its expression RUNS.
    if (ts.isExpressionWithTypeArguments(current) && ts.isHeritageClause(current.parent)) {
      return current.parent.token !== ts.SyntaxKind.ExtendsKeyword;
    }
    if (ts.isTypeNode(current)) return true;
    if (ts.isTypeAliasDeclaration(current) || ts.isInterfaceDeclaration(current)) return true;
  }
  return false;
}

/** Is this call `useRouter()` — however the hook reached this file? */
function isRouterHookCall(node) {
  const call = unwrap(node);
  if (!call || !ts.isCallExpression(call)) return false;
  const symbol = resolve(call.expression);
  if (!symbol || symbol.getName() !== "useRouter") return false;
  // Next's own declaration, followed through whatever barrel or rename the
  // client used to reach it. The path test is what keeps a local helper of the
  // same name from counting.
  return (symbol.declarations ?? []).some((declaration) =>
    declaration.getSourceFile().fileName.includes("/node_modules/next/")
  );
}

/**
 * Does this module call the router's `refresh()`?
 *
 * Two passes over the file and no scope stack at all. The first collects the
 * SYMBOLS that hold a router, or that hold its `refresh` under any name; the
 * second asks whether a call reaches one. A symbol is already scope-resolved,
 * so a shadowing parameter, a `var` in a block, a switch clause's own binding
 * and a helper written above its declaration are not cases this has to be
 * right about — they are cases it cannot see.
 *
 * A symbol that is EVER given the hook's result stays a router, which is how a
 * conditional reassignment keeps its provenance without a branch model. The
 * cost of that direction is a binding genuinely replaced before every use,
 * read as still holding a router; the cost of the other is missing the pairing
 * this guard exists for, and that trade is not close.
 */
function callsRouterRefresh(file) {
  const routers = new Set();
  const refreshes = new Set();

  /** Is this expression a router — the hook's own call, or a name holding one? */
  const yieldsRouter = (expression) => {
    const value = unwrap(expression);
    if (!value) return false;
    if (isRouterHookCall(value)) return true;
    if (!ts.isIdentifier(value)) return false;
    const symbol = resolve(value);
    return Boolean(symbol && routers.has(symbol));
  };

  /** And is it the router's `refresh`, under whatever name it now has? */
  const yieldsRefresh = (expression) => {
    const value = unwrap(expression);
    if (!value) return false;
    // `const reload = router.refresh` and `const reload = refresh` alike.
    if (ts.isPropertyAccessExpression(value) && value.name.text === "refresh") {
      return yieldsRouter(value.expression);
    }
    if (!ts.isIdentifier(value)) return false;
    const symbol = resolve(value);
    return Boolean(symbol && refreshes.has(symbol));
  };

  const collect = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      // `const navigation = router` is the same router (Codex, #1295). One hop
      // at a time, and the loop below runs this to a fixed point, so a chain of
      // aliases is followed however it is ordered in the file.
      if (ts.isIdentifier(node.name) && yieldsRouter(node.initializer)) {
        const symbol = resolve(node.name);
        if (symbol) routers.add(symbol);
      } else if (ts.isIdentifier(node.name) && yieldsRefresh(node.initializer)) {
        const symbol = resolve(node.name);
        if (symbol) refreshes.add(symbol);
      } else if (ts.isObjectBindingPattern(node.name) && yieldsRouter(node.initializer)) {
        for (const element of node.name.elements) {
          const property = element.propertyName ?? element.name;
          if (ts.isIdentifier(property) && property.text === "refresh" && ts.isIdentifier(element.name)) {
            const symbol = resolve(element.name);
            if (symbol) refreshes.add(symbol);
          }
        }
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const symbol = resolve(node.left);
      if (symbol && yieldsRouter(node.right)) routers.add(symbol);
      else if (symbol && yieldsRefresh(node.right)) refreshes.add(symbol);
    }
    ts.forEachChild(node, collect);
  };

  // To a fixed point, with no cap. An alias can be written above the binding it
  // copies, and a chain written in reverse order discovers one hop per pass, so
  // any bound is a bound on the chain length somebody may write — which is what
  // a cap of 16 turned out to be (Codex, #1295). Termination does not need one:
  // both sets only ever grow, and they draw from the file's finitely many
  // symbols, so a pass that adds nothing is the last. Two passes is the normal
  // case.
  for (let before = -1; routers.size + refreshes.size !== before; ) {
    before = routers.size + refreshes.size;
    collect(file);
  }

  /** The object whose `refresh` this callee reaches, by dot or by `["refresh"]`. */
  const refreshTargetOf = (callee) => {
    if (ts.isPropertyAccessExpression(callee)) {
      return callee.name.text === "refresh" ? callee.expression : null;
    }
    if (ts.isElementAccessExpression(callee)) {
      const argument = callee.argumentExpression;
      const key =
        argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
          ? argument.text
          : null;
      return key === "refresh" ? callee.expression : null;
    }
    return null;
  };

  let found = false;
  const inspect = (node) => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const target = refreshTargetOf(node.expression);
      if (target) {
        // `useRouter().refresh()`, with no binding at all.
        if (isRouterHookCall(target)) found = true;
        else {
          const symbol = resolve(unwrap(target));
          if (symbol && routers.has(symbol)) found = true;
        }
      }
      if (!found && ts.isIdentifier(node.expression)) {
        const symbol = resolve(node.expression);
        if (symbol && refreshes.has(symbol)) found = true;
      }
    }
    ts.forEachChild(node, inspect);
  };
  inspect(file);
  return found;
}

/**
 * The server-action module this file holds a RUNTIME reference into, if any.
 *
 * Both halves are the checker's answers rather than this file's. Which module
 * a binding really comes from is `getAliasedSymbol`, so a barrel, a default
 * re-export, a two-statement re-export and a `.js` specifier all resolve to the
 * declaration itself, and a mixed barrel is judged by the BINDING the client
 * took rather than by everything the barrel happens to re-export. Whether the
 * binding survives to runtime is symbol identity plus position: an identifier
 * counts only when it resolves to this very import and stands somewhere that is
 * not erased, so neither the `type` keyword, nor an inferred type-only use, nor
 * an unrelated identifier of the same spelling can answer for it.
 */
/**
 * A namespace member named by a static string key, resolved through the module
 * rather than through a node the checker can attach a symbol to.
 *
 * `actions["save"]` has no identifier to ask about, so the member is looked up
 * on the namespace's own exports. A computed key that is not a literal names
 * nothing knowable and resolves nothing.
 */
function memberOfNamespace(namespaceSymbol, argument) {
  if (
    !argument ||
    !(ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
  ) {
    return undefined;
  }
  const module = namespaceSymbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(namespaceSymbol)
    : namespaceSymbol;
  const member = checker
    .getExportsOfModule(module)
    .find((exported) => exported.getName() === argument.text);
  if (!member) return undefined;
  return member.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(member) : member;
}

function importedActionModule(file) {
  /** Named and default bindings that resolve into a `"use server"` module. */
  const actionBindings = new Map();
  /** `import * as actions` bindings, whose members are resolved where used. */
  const namespaces = new Set();

  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;

    const named = clause.namedBindings;
    if (named && ts.isNamespaceImport(named)) {
      const local = checker.getSymbolAtLocation(named.name);
      if (local) namespaces.add(local);
    }

    const names = [];
    if (clause.name) names.push(clause.name);
    if (named && ts.isNamedImports(named)) {
      for (const element of named.elements) {
        if (!element.isTypeOnly) names.push(element.name);
      }
    }
    for (const name of names) {
      const local = checker.getSymbolAtLocation(name);
      const declaration = resolve(name)?.declarations?.[0];
      if (!local || !declaration) continue;
      const source = declaration.getSourceFile();
      if (isServerActionModule(source)) actionBindings.set(local, source);
    }
  }
  if (actionBindings.size === 0 && namespaces.size === 0) return null;

  let held = null;
  const visit = (node) => {
    if (held) return;

    // `actions.save()` and `actions["save"]()` through `import * as actions`.
    // The MEMBER is resolved, not the namespace, so a barrel that only
    // `export *`s an action module still lands on the declaration; and both
    // member syntaxes are read, for the same reason the refresh call is
    // (Codex, #1295).
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      !insideTypePosition(node)
    ) {
      const object = ts.isIdentifier(node.expression)
        ? checker.getSymbolAtLocation(node.expression)
        : undefined;
      if (object && namespaces.has(object)) {
        const member = ts.isPropertyAccessExpression(node)
          ? resolve(node.name)
          : memberOfNamespace(object, node.argumentExpression);
        const declaration = member?.declarations?.[0];
        if (declaration && isServerActionModule(declaration.getSourceFile())) {
          held = declaration.getSourceFile();
          return;
        }
      }
    }

    if (ts.isIdentifier(node) && !insideTypePosition(node) && !isImportBindingSite(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      const source = symbol && actionBindings.get(symbol);
      if (source) held = source;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return held;
}

const problems = [];
const judged = judgedFiles();
const entries = judged.filter((file) => !isServerActionModule(file) && hasDirective(file, "use client"));
const actionModules = judged.filter(isServerActionModule).length;
const reachedFrom = clientReachableFiles(entries);

let clientModules = 0;
for (const file of reachedFrom.keys()) {
  // Reached, and the boundary itself: an action module holds no router.
  if (isServerActionModule(file)) continue;
  clientModules += 1;
  if (!callsRouterRefresh(file)) continue;
  const target = importedActionModule(file);
  if (target === null) continue;
  const here = relative(process.cwd(), file.fileName);
  const there = relative(process.cwd(), target.fileName);
  const route = hasDirective(file, "use client")
    ? ""
    : `\n      It declares no "use client" of its own; Next ships it to the browser through ` +
      `${routeToEntry(file, reachedFrom).join(" -> ")}.`;
  problems.push(
    `${here}: calls the router's refresh() and holds a runtime reference to the server actions in ${there}.${route}\n` +
      `      Two answers for one page; measured at 11 dropped updates in 100 (nc#1286).\n` +
      `      Revalidate the path in the action instead, or post a form to a route handler that answers 303.`
  );
}

if (problems.length > 0) {
  console.error(
    "Action/refresh lint FAILED — a client module pairs a server action with a router refresh:\n"
  );
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(`\n${problems.length} problem(s). See scripts/action-refresh-lint.mjs for the measurements.`);
  process.exit(1);
}

console.log(
  `Action/refresh lint passed: ${entries.length} "use client" entr(ies) reach ${clientModules} ` +
    `module(s) Next ships to the browser, resolved against ${actionModules} server-action ` +
    `module(s); none pairs an action with a router refresh.`
);
