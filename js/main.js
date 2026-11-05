import { Match } from './controller.js?v=3';
import { mount } from './ui.js?v=3';

const app = document.querySelector('#app');
const game = new Match();
mount(app, game);
