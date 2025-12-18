import { Language } from '../../languages';
import * as redis from '../redis';
import * as rmq from '../rmq';
import { codeFingerprint } from '../../utils';
import { CompilationResult, TestcaseResult, RPCTaskType, TaskStatus, RPCRequest, CompileTask, FileContent } from '../../interfaces';
import winston = require('winston');

export async function compile(
    code: string, language: Language, extraFiles: FileContent[] = [], priority: number
): Promise<[string, CompilationResult]> {
    if (extraFiles) {
        for (const f of extraFiles) {
            if (f.name === 'frame.cpp') {
                if (f.content.indexOf('// YOUR CODE GOES HERE') != -1) {
                    code = f.content.replace('// YOUR CODE GOES HERE', code);
                } else {
                    code = '#include "frame.cpp"\n' + code;
                }
            }
            if (f.name === 'frame.java') {
                if (f.content.indexOf('// YOUR CODE GOES HERE') != -1) {
                    code = f.content.replace('// YOUR CODE GOES HERE', code);
                }
            }
            if (f.name === 'frame.py') {
                if (f.content.indexOf('# YOUR CODE GOES HERE') != -1) {
                    code = f.content.replace('# YOUR CODE GOES HERE', code);
                } else {
                    code = 'from frame import *\n' + code;
                }
            }
        }
    }
    const fingerprint = codeFingerprint(code, language.name);
    winston.debug(`Compiling code, fingerprint = ${fingerprint}`);
    let result: CompilationResult;
    const unlock = await redis.getCompileLock(fingerprint);
    winston.debug(`Got redis lock for ${fingerprint}`);
    try {
        if (await redis.checkBinaryExistance(fingerprint)) {
            winston.debug('Binary already exists. Exiting');
            result = { status: TaskStatus.Done };
        } else {
            const task: CompileTask = {
                code: code,
                language: language.name,
                extraFiles: extraFiles,
                binaryName: fingerprint
            };
            result = await rmq.runTask({ type: RPCTaskType.Compile, task: task }, priority);
        }
        return [fingerprint, result];
    } finally {
        await unlock();
    }
}