/// <reference types="node" />
/**
 * Push Model <http://github.com/ken107/push-model>
 * Copyright 2018, Hai Phan <hai.phan@gmail.com>
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Server } from "http";
export declare const options: {
    enableSplice: boolean;
    excludeProperty: (target: any, prop: string) => boolean;
} & {
    enableSplice: boolean;
    excludeProperty: (target: any, prop: string) => boolean;
};
export declare class ErrorResponse {
    code: number;
    message: string;
    data: string;
    constructor(code: number, message: string, data: string);
}
export declare function mount(server: Server, path: string, model: any, acceptOrigins: Array<string>): void;
export declare function trackKeys(obj: any): any;
export declare function untrackKeys(obj: any): void;
