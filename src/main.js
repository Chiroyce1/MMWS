"use strict";


const mmws = {
    "regexNotInString":     () => re => new RegExp(
        `(?<!"(?:\\\\"|[^"])*)(?:${re.source})|(?:${re.source})(?=[^"]*$)`,
        [...new Set(["g", ...re.flags])].join("")
    ),
    "ruleRegex":
        () => /^[^ \n][^\n]*(?:\n {4}[^\n]*)(?:\n {4}[^\n]*|\n *)*/gm,
    "statementRegex":       () => /^[^ \n][^\n]*$(?!\n {4})/gm,
    "nameTokenRegex":
        () => /(?::|#|\.|==?)[a-zA-Z\-_]+|(?:\+|>>?)|!\(|\)|"[^"]*"| +/gm,
    "whitespaceRegex":      () => mmws.regexNotInString(/ +/),
    "replacements":         () => [
        [/([:#.][a-zA-Z\-_]+)\+([:#.][a-zA-Z\-_]+)/g, "$1$2"], // plus
        [/([:#.][a-zA-Z\-_]+)\>([:#.][a-zA-Z\-_]+)/g, "$1>$2"], // single gt
        [/([:#.][a-zA-Z\-_]+)\>\>([:#.][a-zA-Z\-_]+)/g, "$1 $2"], // double gt
        [/!\(([^)]+)\)/g, ":not($1)"], // not
        [/(?<![a-zA-Z\-_]):([a-zA-Z\-_]+)/g, "$1"], // colons
        [/(?<![a-zA-Z\-_])#([a-zA-Z\-_]+)/g, "#$1"], // ids
        [/(?<![a-zA-Z\-_])\.([a-zA-Z\-_]+)/g, ".$1"], // classes
        [/\=([a-zA-Z\-_]+)("(?:\\"|[^"]+)*")/g, "[$1=$2]"], // eq
        [/\=\=([a-zA-Z\-_]+)/g, "[$1]"], // eqeq
    ],
    "combinedReplacements": () => new RegExp(
        `^(?:${mmws.replacements.map(re => `(?:${
            re[0].source
                .replace(/(?<!\\)\((?!\?=|\?!|\?<=|\?<!|\?:)/g, "(?:")
        })`).join("|")})+$`, "g"
    ),
    "isValidKey":           () => key => !!(key
        .replace(/ /g, "")
        .match(mmws.combinedReplacements)),
    "commentRegex":
        () => mmws.regexNotInString(/\/\/(?:.|\n)*?$|\/\*(?:.|\n)*?\*\//m),
    "ruleComponent":        () => /(?<!"(?:\\"|[^"])+);|;(?=[^"]*$)/g,
    "ruleSubComponent":     () => /(?<!"(?:\\"|[^"])+) +| +(?=[^"]*$)/g,
    "variableRegex":        () => /\$([a-zA-Z\-_]*) +(.*)/g,
    "error":                () => console.warn,
    "counter":              () => 0,
};
Object.keys(mmws).forEach(k => mmws[k] = mmws[k]());


function mmwsToCss(code) {
    let cssKey, cssObj, i, important,
        isVariable, lastValue, key, order,
        propName, rep, resultCSS, rule,
        rules, rulesObj, selector,
        statements, subc, vars;

    if (typeof code !== "string") {return;}

    // Get important parts from the code
    code = code.replace(mmws.commentRegex, "");
    rules = [...code.matchAll(mmws.ruleRegex)]
        .map(r => r.toString().trim().split("\n")
            .map(s => s.trim()));
    statements = [...code.matchAll(mmws.statementRegex)]
        .map(r => r.toString());

    // Create basic results
    rulesObj = {};
    for (rule of rules) {
        if (!mmws.isValidKey(rule[0])) {
            mmws.error(`Invalid rule: ${rule[0]}`);
            return null;
        }
        rulesObj[rule[0]] = rule.splice(1);
    }

    // Convert to CSS syntax
    cssObj = {};
    order = [];
    for (key of Object.keys(rulesObj)) {
        cssKey = key;
        cssKey = cssKey.replace(mmws.whitespaceRegex, "");
        for (rep of mmws.replacements) {
            cssKey = cssKey.replace(rep[0], rep[1]);
        }
        if (cssKey === "html") {
            cssKey = ":root";
        }
        order.push(cssKey);
        cssObj[cssKey] = [];
        for (rule of rulesObj[key]) {
            rule = rule.split(mmws.ruleComponent)
                .map(
                    s => s.trim().split(mmws.ruleSubComponent).map(s => s.trim())
                );
            i = 0;
            important = false;
            lastValue = null;
            isVariable = false;
            for (subc of rule) {
                i++;
                if (i === 1) {
                    if (subc[0][0] === "!") {
                        important = true;
                        subc[0] = subc[0].slice(1);
                    }
                    propName = subc[0];
                    if (propName[0] === "$") {
                        propName = `--${propName.slice(1)}`;
                        isVariable = true;
                    }
                    subc = subc.splice(1);
                    subc = subc.map(
                        s => s.replace(/\$([a-zA-Z\-_]+)/, "var(--$1)")
                    );
                    if (subc.length) {
                        cssObj[cssKey].push(
                            `${propName}:${subc.join(" ")}${
                                important ? "!important" : ""
                            };`
                        );
                        lastValue = subc;
                    }
                } else {
                    if (isVariable) {
                        mmws.error(
                            "Variable declerations can't have special rules"
                        );
                        return null;
                    }
                    if (!order.includes(`${cssKey}:${subc[0]}`)) {
                        cssObj[`${cssKey}:${subc[0]}`] = [];
                        order.push(`${cssKey}:${subc[0]}`);
                        selector = subc[0];
                    }
                    subc = subc.splice(1)
                    if (subc.length) {
                        cssObj[`${cssKey}:${selector}`].push(
                            `${propName}:${subc.join(" ")}${
                                important ? "!important" : ""
                            };`
                        );
                        lastValue = subc;
                    } else if (lastValue !== null) {
                        cssObj[`${cssKey}:${selector}`].push(
                            `${propName}:${lastValue.join("")}${
                                important ? "!important" : ""
                            };`
                        );
                    } else {
                        mmws.error("Declerations can't be empty.");
                        return;
                    }
                }
            }
        }
    }

    // Add the statements to CSS
    if (statements.some(s => s.startsWith("$"))) {
        if (!order.includes(":root")) {
            order = [":root", ...order];
            cssObj[":root"] = [];
        }
        vars = statements.filter(s => s.match(mmws.variableRegex));
        vars = vars.map(v => v.replace(mmws.variableRegex, "--$1: $2;"));
        cssObj[":root"].push(...vars);
    }
    

    // Convert to CSS
    resultCSS = "";
    for (key of order) {
        if (cssObj[key].length) {
            resultCSS += `${key}{${cssObj[key].join("")}}`;
        }
    }

    return resultCSS
}


async function mmwsConvertTagsToCss() {
    let element, fileName, mmwsCode,
        response, css, styleEl;

    for (element of document.querySelectorAll("mmws")) {
        fileName = element.getAttribute("src");
        if (fileName === null) {
            mmwsCode = element.innerHTML;
            mmwsCode = mmwsCode.split("\n")
                .filter(c => c.trim())
                .join("\n");
            mmwsCode = mmwsCode.split("\n")
                .map(s => s.replace(
                    new RegExp(
                        `^ {${Math.min(...
                            [...mmwsCode.matchAll(/^ +(?! *$)/gm)]
                                .map(e => e[0].length)
                            )}}`,
                        "gm"
                    ), "")
                ).join("\n");
            mmws.counter++;
            fileName = `inline-${mmws.counter}`;
        } else {
            response = await fetch(fileName);
            if (response.status === 404) {
                mmws.error(`${fileName} does not exist.`);
                continue;
            }
            mmwsCode = await response.text();
        }
        css = mmwsToCss(mmwsCode);
        if (css !== null) {
            styleEl = document.createElement("style");
            styleEl.classList.add("-mmws-converted");
            styleEl.id = `--mmws-from-${fileName.replace(/[^A-Z0-9-]/ig, "-")}`;
            styleEl.innerHTML = css;
            document.head.appendChild(styleEl);
        }
    element.remove();
    }
}


mmwsConvertTagsToCss();
