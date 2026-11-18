import { Match } from './controller.js?v=7';
import { mount } from './ui.js?v=7';

const app = document.querySelector('#app');
const game = new Match();
mount(app, game);
