const CDP = require('chrome-remote-interface');
const { log } = require('./plugin');

class YandexMusicController {
  constructor() {
    this.port = 9222;
    this.connected = false;
  }

  async getClient() {
    try {
      const client = await CDP({ port: this.port });
      
      await Promise.all([
        client.Page.enable(),
        client.Runtime.enable()
      ]);
      
      return client;
    } catch (err) {
      if (err.message.includes('connect ECONNREFUSED')) {
        log.error('Не удалось подключиться к приложению Яндекс Музыка на порту', this.port);
        log.error('Убедитесь, что приложение запущено с параметром --remote-debugging-port=9222');
        return null;
      }
      log.error('Ошибка при создании CDP-клиента:', err);
      return null;
    }
  }

  async checkConnection() {
    let client;
    try {
      client = await CDP({ port: this.port });
      log.info('Успешное подключение к Яндекс Музыке на порту', this.port);
      
      await client.close();
      
      return true;
    } catch (err) {
      if (err.message.includes('connect ECONNREFUSED')) {
        log.error('Не удалось подключиться к приложению Яндекс Музыка на порту', this.port);
        log.error('Убедитесь, что приложение запущено с параметром --remote-debugging-port=9222');
        return false;
      }
      log.error('Ошибка при проверке соединения с Яндекс Музыкой:', err);
      return false;
    }
  }

  async previousTrack() {
    return await this.executeAction('PREVIOUS_TRACK_BUTTON', 'Переход к предыдущему треку');
  }

  async nextTrack() {
    return await this.executeAction('NEXT_TRACK_BUTTON', 'Переход к следующему треку');
  }

  async likeTrack() {
    return await this.executeAction('LIKE_BUTTON', 'Установка лайка');
  }

  async dislikeTrack() {
    return await this.executeAction('DISLIKE_BUTTON', 'Установка дизлайка');
  }

  async togglePlayback() {
    let client;
    try {
      log.info('Подключение к приложению Яндекс.Музыка на порту', this.port);
      
      try {
        client = await CDP({ port: this.port });
      } catch (connErr) {
        if (connErr.message.includes('connect ECONNREFUSED')) {
          log.error('Не удалось подключиться к приложению Яндекс.Музыка на порту', this.port);
          log.error('Убедитесь, что приложение запущено с параметром --remote-debugging-port=9222');
          return false;
        }
        throw connErr;
      }
      
      const { Runtime, Page } = client;
      
      await Promise.all([
        Page.enable(),
        Runtime.enable()
      ]);
      
      log.info('Определение состояния воспроизведения...');
      
      const result = await Runtime.evaluate({
        expression: `
          (function() {
            try {
              let pauseButton = document.querySelector("button.BaseSonataControlsDesktop_sonataButton__GbwFt[data-test-id='PAUSE_BUTTON']");
              if (pauseButton) {
                console.log("Найдена кнопка паузы в нижней панели - трек воспроизводится");
                pauseButton.click();
                return { success: true, message: 'Трек поставлен на паузу', wasPlaying: true };
              }
              
              let playButton = document.querySelector("button.BaseSonataControlsDesktop_sonataButton__GbwFt[data-test-id='PLAY_BUTTON']");
              if (playButton) {
                if (!playButton.classList.contains("PlayButtonWithCover_playButton__rV9pQ")) {
                  console.log("Найдена кнопка воспроизведения в нижней панели - трек на паузе");
                  playButton.click();
                  return { success: true, message: 'Трек запущен', wasPlaying: false };
                }
              }

              const pauseSvgL = document.querySelector("svg.BaseSonataControlsDesktop_playButtonIcon__TlFqv use[xlink:href='/icons/sprite.svg#pause_filled_l']");
              if (pauseSvgL) {
                const pauseButton = pauseSvgL.closest('button');
                if (pauseButton) {
                  console.log("Найдена кнопка по SVG иконке паузы (размер l) в нижней панели");
                  pauseButton.click();
                  return { success: true, message: 'Трек поставлен на паузу', wasPlaying: true };
                }
              }

              const playSvgL = document.querySelector("svg.BaseSonataControlsDesktop_playButtonIcon__TlFqv use[xlink:href='/icons/sprite.svg#play_filled_l']");
              if (playSvgL) {
                const playButton = playSvgL.closest('button');
                if (playButton) {
                  console.log("Найдена кнопка по SVG иконке воспроизведения (размер l) в нижней панели");
                  playButton.click();
                  return { success: true, message: 'Трек запущен', wasPlaying: false };
                }
              }
              
              const sonataButtons = document.querySelectorAll(".BaseSonataControlsDesktop_sonataButtons__7vLtw button");
              if (sonataButtons.length >= 3) {
                const middleButton = sonataButtons[1];
                console.log("Выбрана средняя кнопка в группе кнопок управления");
                middleButton.click();
                return { success: true, message: 'Действие с треком выполнено через среднюю кнопку', wasPlaying: null };
              }
              
              return { 
                success: false, 
                message: 'Не удалось найти кнопку воспроизведения или паузы'
              };
            } catch (err) {
              return { 
                success: false, 
                message: 'Ошибка при определении состояния воспроизведения: ' + err.message,
                error: err.toString()
              };
            }
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
      
      if (result.result && result.result.value) {
        const value = result.result.value;
        
        if (value.success) {
          log.info(value.message);
          log.info(`Трек был ${value.wasPlaying ? 'в состоянии воспроизведения' : 'на паузе'}`);
          return true;
        } else {
          log.error('Не удалось переключить воспроизведение:', value.message);
          
          if (value.error) {
            log.error('Детали ошибки:', value.error);
          }
          
          return false;
        }
      } else {
        log.error('Не удалось выполнить скрипт в контексте страницы');
        return false;
      }
    } catch (err) {
      log.error('Ошибка при выполнении скрипта:', err);
      return false;
    } finally {
      if (client) {
        try {
          await client.close();
        } catch (closeErr) {
          log.error('Ошибка при закрытии соединения:', closeErr);
        }
      }
    }
  }

  async executeAction(buttonId, actionDescription) {
    let client;
    try {
      log.info('Подключение к приложению Яндекс.Музыка на порту', this.port);
      
      try {
        client = await CDP({ port: this.port });
      } catch (connErr) {
        if (connErr.message.includes('connect ECONNREFUSED')) {
          log.error('Не удалось подключиться к приложению Яндекс.Музыка на порту', this.port);
          log.error('Убедитесь, что приложение запущено с параметром --remote-debugging-port=9222');
          return false;
        }
        throw connErr;
      }
      
      const { Runtime, Page } = client;
      
      await Promise.all([
        Page.enable(),
        Runtime.enable()
      ]);
      
      log.info(`Выполнение действия: ${actionDescription}...`);
      
      const result = await Runtime.evaluate({
        expression: `
          (function() {
            try {
              let playerBar = document.querySelector('.PlayerBarDesktopWithBackgroundProgressBar_root__bpmwN');
              if (!playerBar) {
                playerBar = document.querySelector('[data-test-id="PLAYERBAR_DESKTOP"]');
                if (!playerBar) {
                  console.log("Не найдена нижняя панель плеера");
                  return { success: false, message: 'Не найдена нижняя панель плеера' };
                }
              }
              
              let button = playerBar.querySelector("[data-test-id='${buttonId}']");
              
              if (button) {
                console.log("Найдена кнопка:", "${buttonId}", "в нижней панели плеера");
                button.click();
                return { success: true, message: 'Кнопка найдена и нажата' };
              } else {
                console.log("Кнопка не найдена:", "${buttonId}", "в нижней панели плеера");
                
                if ('${buttonId}' === 'LIKE_BUTTON' || '${buttonId}' === 'DISLIKE_BUTTON') {
                  const sonataSection = playerBar.querySelector('.PlayerBarDesktopWithBackgroundProgressBar_sonata__mGFb_');
                  if (sonataSection) {
                    if ('${buttonId}' === 'LIKE_BUTTON') {
                      const likeButton = sonataSection.querySelector('button:last-of-type');
                      if (likeButton) {
                        console.log("Найдена кнопка лайка по позиции в нижней панели");
                        likeButton.click();
                        return { success: true, message: 'Кнопка лайка найдена по позиции и нажата' };
                      }
                    }
                    else if ('${buttonId}' === 'DISLIKE_BUTTON') {
                      const dislikeButton = sonataSection.querySelector('button:first-of-type');
                      if (dislikeButton) {
                        console.log("Найдена кнопка дизлайка по позиции в нижней панели");
                        dislikeButton.click();
                        return { success: true, message: 'Кнопка дизлайка найдена по позиции и нажата' };
                      }
                    }
                  }
                }
                
                return { success: false, message: 'Кнопка не найдена в нижней панели плеера' };
              }
            } catch (err) {
              return { 
                success: false, 
                message: 'Ошибка при поиске кнопки: ' + err.message,
                error: err.toString()
              };
            }
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
      
      if (result.result && result.result.value) {
        const value = result.result.value;
        
        if (value.success) {
          log.info(`${actionDescription} выполнено успешно`);
          return true;
        } else {
          log.error(`Не удалось выполнить действие: ${actionDescription}`, value.message);
          
          if (value.error) {
            log.error('Детали ошибки:', value.error);
          }
          
          return false;
        }
      } else {
        log.error('Не удалось выполнить скрипт в контексте страницы');
        return false;
      }
    } catch (err) {
      log.error('Ошибка при выполнении скрипта:', err);
      return false;
    } finally {
      if (client) {
        try {
          await client.close();
        } catch (closeErr) {
          log.error('Ошибка при закрытии соединения:', closeErr);
        }
      }
    }
  }

  async toggleMute() {
    let client;
    try {
      log.info('Подключение к приложению Яндекс.Музыка на порту', this.port);
      
      try {
        client = await CDP({ port: this.port });
      } catch (connErr) {
        if (connErr.message.includes('connect ECONNREFUSED')) {
          log.error('Не удалось подключиться к приложению Яндекс.Музыка на порту', this.port);
          log.error('Убедитесь, что приложение запущено с параметром --remote-debugging-port=9222');
          return false;
        }
        throw connErr;
      }
      
      const { Runtime, Page } = client;
      
      await Promise.all([
        Page.enable(),
        Runtime.enable()
      ]);
      
      log.info('Определение состояния звука и переключение...');
      
      const result = await Runtime.evaluate({
        expression: `
          (function() {
            try {
              let muteButton = document.querySelector("button.ChangeVolume_button__4HLEr[data-test-id='CHANGE_VOLUME_BUTTON']");
              if (muteButton) {
                const ariaLabel = muteButton.getAttribute('aria-label');
                const isMuted = ariaLabel === 'Включить звук';
                
                console.log("Найдена кнопка управления звуком, текущее состояние:", isMuted ? "Звук выключен" : "Звук включен");
                muteButton.click();
                
                return { 
                  success: true, 
                  message: isMuted ? 'Звук включен' : 'Звук выключен', 
                  wasMuted: isMuted 
                };
              }
              
              const volumeOffSvg = document.querySelector("svg.ChangeVolume_icon__5Zv2a use[xlink:href='/icons/sprite.svg#volumeOff_xs']");
              if (volumeOffSvg) {
                const muteButton = volumeOffSvg.closest('button');
                if (muteButton) {
                  console.log("Найдена кнопка по SVG иконке выключенного звука - звук выключен");
                  muteButton.click();
                  return { success: true, message: 'Звук включен', wasMuted: true };
                }
              }
              
              const volumeSvg = document.querySelector("svg.ChangeVolume_icon__5Zv2a use[xlink:href='/icons/sprite.svg#volume_xs']");
              if (volumeSvg) {
                const muteButton = volumeSvg.closest('button');
                if (muteButton) {
                  console.log("Найдена кнопка по SVG иконке звука - звук включен");
                  muteButton.click();
                  return { success: true, message: 'Звук выключен', wasMuted: false };
                }
              }
              
              return { 
                success: false, 
                message: 'Не удалось найти кнопку управления звуком'
              };
            } catch (err) {
              return { 
                success: false, 
                message: 'Ошибка при управлении звуком: ' + err.message,
                error: err.toString()
              };
            }
          })()
        `,
        awaitPromise: true,
        returnByValue: true
      });
      
      if (result.result && result.result.value) {
        const value = result.result.value;
        
        if (value.success) {
          log.info(value.message);
          log.info(`Звук был ${value.wasMuted ? 'выключен' : 'включен'}`);
          return true;
        } else {
          log.error('Не удалось переключить звук:', value.message);
          
          if (value.error) {
            log.error('Детали ошибки:', value.error);
          }
          
          return false;
        }
      } else {
        log.error('Не удалось выполнить скрипт в контексте страницы');
        return false;
      }
    } catch (err) {
      log.error('Ошибка при выполнении скрипта:', err);
      return false;
    } finally {
      if (client) {
        try {
          await client.close();
        } catch (closeErr) {
          log.error('Ошибка при закрытии соединения:', closeErr);
        }
      }
    }
  }
}

const yandexMusicController = new YandexMusicController();
module.exports = yandexMusicController; 