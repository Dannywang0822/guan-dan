import { Match } from './controller.js?v=9';
import { mount } from './ui.js?v=9';

const app = document.querySelector('#app');
const game = new Match();
mount(app, game);
