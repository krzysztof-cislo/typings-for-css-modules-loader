// @ts-check
const {
  filenameToInterfaceName,
  filenameToTypingsFilename,
  getCssModuleKeys,
  generateGenericExportInterface
} = require("./utils");
const persist = require("./persist");
const { getOptions } = require("loader-utils");
const validateOptions = require("schema-utils");

const schema = {
  type: "object",
  properties: {
    eol: {
      description:
        "Newline character to be used in generated d.ts files. Uses OS default. This option is overridden by the formatter option.",
      type: "string"
    },
    banner: {
      description: "To add a 'banner' prefix to each generated `*.d.ts` file",
      type: "string"
    },
    formatter: {
      description:
        "Possible options: none and prettier (requires prettier package installed). Defaults to prettier if `prettier` module can be resolved",
      enum: ["prettier", "none"]
    }
  },
  additionalProperties: false
};

/** @type {any} */
const configuration = {
  name: "typings-for-css-modules-loader",
  baseDataPath: "options"
};

/** @type {((this: import('webpack').loader.LoaderContext, ...args: any[]) => void) & {pitch?: import('webpack').loader.Loader['pitch']}} */
module.exports = function(content, ...args) {
  const options = getOptions(this) || {};

  validateOptions(schema, options, configuration);

  if (this.cacheable) {
    this.cacheable();
  }

  // let's only check `exports.locals` for keys to avoid getting keys from the sourcemap when it's enabled
  const cssModuleKeys = getCssModuleKeys(
    content.substring(content.indexOf("___CSS_LOADER_EXPORT___.locals"))
  );

  /** @type {any} */
  const callback = this.async();

  const successfulCallback = () => {
    callback(null, content, ...args);
  };

  if (cssModuleKeys.length === 0) {
    // no css module output found
    successfulCallback();
    return;
  }

  const filename = this.resourcePath;

  const cssModuleInterfaceFilename = filenameToTypingsFilename(filename);
  const interfaceName = filenameToInterfaceName(filename);
  const cssModuleDefinition = generateGenericExportInterface(
    cssModuleKeys,
    interfaceName
  );

  applyFormattingAndOptions(cssModuleDefinition, options)
    .then(output => {
      persist(cssModuleInterfaceFilename, output);
    })
    .catch(err => {
      this.emitError(err);
    })
    .then(successfulCallback);
};

/**
 * @param {string} cssModuleDefinition
 * @param {any} options
 */
async function applyFormattingAndOptions(cssModuleDefinition, options) {
  if (options.banner) {
    // Prefix banner to CSS module
    cssModuleDefinition = options.banner + "\n" + cssModuleDefinition;
  }

  if (
    options.formatter === "prettier" ||
    (!options.formatter && canUsePrettier())
  ) {
    cssModuleDefinition = await applyPrettier(cssModuleDefinition);
  } else {
    // at very least let's ensure we're using OS eol if it's not provided
    cssModuleDefinition = cssModuleDefinition.replace(
      /\r?\n/g,
      options.eol || require("os").EOL
    );
  }

  return cssModuleDefinition;
}

/**
 * @param {string} input
 * @returns {Promise<string>}
 */
async function applyPrettier(input) {
  const prettier = require("prettier");

  const config = await prettier.resolveConfig("./", {
    editorconfig: true
  });

  return prettier.format(
    input,
    Object.assign({}, config, { parser: "typescript" })
  );
}

let isPrettierInstalled;
/**
 * @returns {boolean}
 */
function canUsePrettier() {
  if (typeof isPrettierInstalled !== "boolean") {
    try {
      require.resolve("prettier");
      isPrettierInstalled = true;
    } catch (_) {
      isPrettierInstalled = false;
    }
  }

  return isPrettierInstalled;
}
