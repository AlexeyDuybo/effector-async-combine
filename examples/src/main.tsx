import { createEvent } from 'effector';
import { formModelFactory } from './bug';

const init = createEvent<{ description: string }>();

formModelFactory(init);

init({ description: '42' });