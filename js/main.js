import { Match } from './controller.js?v=11';
import { mount } from './ui.js?v=11';

const app = document.querySelector('#app');
const game = new Match();
mount(app, game);
