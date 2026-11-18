import { Match } from './controller.js?v=8';
import { mount } from './ui.js?v=8';

const app = document.querySelector('#app');
const game = new Match();
mount(app, game);
