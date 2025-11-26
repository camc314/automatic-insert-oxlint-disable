import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TEST_DIR = join(tmpdir(), 'oxlint-disable-test');

function setupTestDir() {
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });

    // Create oxlintrc.json
    writeFileSync(
        join(TEST_DIR, 'oxlintrc.json'),
        JSON.stringify({
            rules: {},
        }),
    );

    // Create package.json
    writeFileSync(
        join(TEST_DIR, 'package.json'),
        JSON.stringify({
            name: 'test',
            type: 'module',
        }),
    );

    // Install oxlint
    execSync('pnpm add -D oxlint', { cwd: TEST_DIR, stdio: 'pipe' });
}

function cleanupTestDir() {
    if (existsSync(TEST_DIR)) {
        rmSync(TEST_DIR, { recursive: true });
    }
}

function runScript(args: string, env: Record<string, string> = {}): { stdout: string; stderr: string; exitCode: number } {
    const scriptPath = join(process.cwd(), 'src/index.ts');
    try {
        const stdout = execSync(`node --experimental-strip-types ${scriptPath} ${args}`, {
            cwd: TEST_DIR,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, ...env },
        });
        return { stdout, stderr: '', exitCode: 0 };
    } catch (error: unknown) {
        const err = error as { stdout?: string; stderr?: string; status?: number };
        return {
            stdout: err.stdout ?? '',
            stderr: err.stderr ?? '',
            exitCode: err.status ?? 1,
        };
    }
}

/**
 * Runs a snapshot test case
 * @param input - The input source code
 * @param rule - The rule to disable (e.g., 'eslint/no-unused-vars')
 * @param filename - Optional filename (defaults to 'test.js')
 * @returns The formatted snapshot string
 */
function runSnapshotTest(input: string, rule: string, filename = 'test.js'): string {
    const testFile = join(TEST_DIR, filename);
    writeFileSync(testFile, input);

    const result = runScript(`--rule ${rule} ${filename}`, { SKIP_GIT_CHECK: '1' });

    if (result.exitCode !== 0) {
        throw new Error(`Script failed with exit code ${result.exitCode}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`);
    }

    const output = readFileSync(testFile, 'utf-8');

    let snap = '';
    snap += '### INPUT:\n';
    snap += '```\n';
    snap += input.trimEnd() + '\n';
    snap += '```\n\n';
    snap += '### OUTPUT:\n';
    snap += '```\n';
    snap += output.trimEnd() + '\n';
    snap += '```';

    return snap;
}

describe('automatic-insert-oxlint-disable e2e', () => {
    beforeEach(() => {
        setupTestDir();
    });

    afterEach(() => {
        cleanupTestDir();
    });

    describe('error cases', () => {
        it('should bail out when working tree has uncommitted changes', () => {
            // Initialize git repo for this test
            execSync('git init', { cwd: TEST_DIR, stdio: 'pipe' });
            execSync('git config user.email "test@test.com"', { cwd: TEST_DIR, stdio: 'pipe' });
            execSync('git config user.name "Test"', { cwd: TEST_DIR, stdio: 'pipe' });
            execSync('git add -A', { cwd: TEST_DIR, stdio: 'pipe' });
            execSync('git commit -m "initial"', { cwd: TEST_DIR, stdio: 'pipe' });

            // Create an uncommitted file
            writeFileSync(join(TEST_DIR, 'uncommitted.js'), 'const x = 1;');

            const result = runScript('--rule eslint/no-unused-vars');

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('Working tree has uncommitted changes');
        });

        it('should exit with error when no rule is provided', () => {
            const result = runScript('', { SKIP_GIT_CHECK: '1' });

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('Usage:');
        });

        it('should exit with error for invalid rule format', () => {
            const result = runScript('--rule no-unused-vars', { SKIP_GIT_CHECK: '1' });

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain('Invalid rule format');
        });
    });

    describe('snapshot tests', () => {
        it('single unused variable', () => {
            const input = `\
const unusedVar = 1;
`;

            const snapshot = runSnapshotTest(input, 'eslint/no-unused-vars');

            expect(snapshot).toMatchInlineSnapshot(`
"### INPUT:
\`\`\`
const unusedVar = 1;
\`\`\`

### OUTPUT:
\`\`\`
// oxlint-disable-next-line eslint/no-unused-vars
const unusedVar = 1;
\`\`\`"
`);
        });

        it('multiple unused variables', () => {
            const input = `\
const unused1 = 1;
const unused2 = 2;
const unused3 = 3;
`;

            const snapshot = runSnapshotTest(input, 'eslint/no-unused-vars');

            expect(snapshot).toMatchInlineSnapshot(`
"### INPUT:
\`\`\`
const unused1 = 1;
const unused2 = 2;
const unused3 = 3;
\`\`\`

### OUTPUT:
\`\`\`
// oxlint-disable-next-line eslint/no-unused-vars
const unused1 = 1;
// oxlint-disable-next-line eslint/no-unused-vars
const unused2 = 2;
// oxlint-disable-next-line eslint/no-unused-vars
const unused3 = 3;
\`\`\`"
`);
        });

        it('append to existing disable directive', () => {
            const input = `\
// oxlint-disable-next-line eslint/other-rule
const unusedVar = 1;
`;

            const snapshot = runSnapshotTest(input, 'eslint/no-unused-vars');

            expect(snapshot).toMatchInlineSnapshot(`
"### INPUT:
\`\`\`
// oxlint-disable-next-line eslint/other-rule
const unusedVar = 1;
\`\`\`

### OUTPUT:
\`\`\`
// oxlint-disable-next-line eslint/other-rule, eslint/no-unused-vars
const unusedVar = 1;
\`\`\`"
`);
        });

        it('preserves indentation', () => {
            const input = `\
function foo() {
    const unusedVar = 1;
}
`;

            const snapshot = runSnapshotTest(input, 'eslint/no-unused-vars');

            expect(snapshot).toMatchInlineSnapshot(`
"### INPUT:
\`\`\`
function foo() {
    const unusedVar = 1;
}
\`\`\`

### OUTPUT:
\`\`\`
// oxlint-disable-next-line eslint/no-unused-vars
function foo() {
    // oxlint-disable-next-line eslint/no-unused-vars
    const unusedVar = 1;
}
\`\`\`"
`);
        });

        it('handles nested indentation', () => {
            const input = `\
function outer() {
    function inner() {
        const unusedVar = 1;
    }
}
`;

            const snapshot = runSnapshotTest(input, 'eslint/no-unused-vars');

            expect(snapshot).toMatchInlineSnapshot(`
"### INPUT:
\`\`\`
function outer() {
    function inner() {
        const unusedVar = 1;
    }
}
\`\`\`

### OUTPUT:
\`\`\`
// oxlint-disable-next-line eslint/no-unused-vars
function outer() {
    // oxlint-disable-next-line eslint/no-unused-vars
    function inner() {
        // oxlint-disable-next-line eslint/no-unused-vars
        const unusedVar = 1;
    }
}
\`\`\`"
`);
        });

        it('no violations - file unchanged', () => {
            const input = `\
export const usedVar = 1;
`;

            const testFile = join(TEST_DIR, 'test.js');
            writeFileSync(testFile, input);

            const result = runScript('--rule eslint/no-unused-vars test.js', { SKIP_GIT_CHECK: '1' });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('No diagnostics');

            const output = readFileSync(testFile, 'utf-8');
            expect(output).toBe(input);
        });

        it('mixed used and unused variables', () => {
            const input = `\
const used = 1;
const unused = 2;
console.log(used);
`;

            const snapshot = runSnapshotTest(input, 'eslint/no-unused-vars');

            expect(snapshot).toMatchInlineSnapshot(`
"### INPUT:
\`\`\`
const used = 1;
const unused = 2;
console.log(used);
\`\`\`

### OUTPUT:
\`\`\`
const used = 1;
// oxlint-disable-next-line eslint/no-unused-vars
const unused = 2;
console.log(used);
\`\`\`"
`);
        });

        it('unused function parameter', () => {
            const input = `\
export function greet(name, unused) {
    console.log(name);
}
`;

            const snapshot = runSnapshotTest(input, 'eslint/no-unused-vars');

            expect(snapshot).toMatchInlineSnapshot(`
"### INPUT:
\`\`\`
export function greet(name, unused) {
    console.log(name);
}
\`\`\`

### OUTPUT:
\`\`\`
// oxlint-disable-next-line eslint/no-unused-vars
export function greet(name, unused) {
    console.log(name);
}
\`\`\`"
`);
        });
    });

    describe('dry-run mode', () => {
        it('should not modify files in dry-run mode', () => {
            const input = `\
const unusedVar = 1;
`;
            const testFile = join(TEST_DIR, 'test.js');
            writeFileSync(testFile, input);

            const result = runScript('--rule eslint/no-unused-vars --dry-run test.js', { SKIP_GIT_CHECK: '1' });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('dry run');

            const output = readFileSync(testFile, 'utf-8');
            expect(output).toBe(input);
        });
    });
});
