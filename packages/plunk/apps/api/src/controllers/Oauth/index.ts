import {ChildControllers, Controller} from '@overnightjs/core';

import {Github} from './Github.js';
import {Google} from './Google.js';

@Controller('oauth')
@ChildControllers([new Google(), new Github()])
export class Oauth {}
