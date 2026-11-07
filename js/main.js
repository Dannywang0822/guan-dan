import { Match } from './controller.js?v=4';
import { mount } from './ui.js?v=4';

const app = document.querySelector('#app');
const game = new Match();
mount(app, game);
