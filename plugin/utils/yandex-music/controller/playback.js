'use strict';

const { log } = require('../../plugin');

module.exports = {
  async previousTrack() {
    return await this.runTrackControl('previous', 'Переход к предыдущему треку');
  },

  async nextTrack() {
    return await this.runTrackControl('next', 'Переход к следующему треку');
  },

  async runTrackControl(direction, actionDescription) {
    return this._runDomAction(`ymClickTrackControl('${direction}')`, actionDescription);
  },

  async togglePlayback() {
    try {
      log.info('Определение состояния воспроизведения');
      const value = await this._evaluateDom('return ymTogglePlayback();');
      if (value && value.success) {
        log.info(value.message);
        log.info(`Трек был ${value.wasPlaying ? 'в состоянии воспроизведения' : 'на паузе'}`);
        return true;
      }
      log.error('Не удалось переключить воспроизведение:', value?.message);
      if (value?.error) log.error('Детали ошибки:', value.error);
      return false;
    } catch (err) {
      log.error('Ошибка при выполнении скрипта:', err);
      return false;
    }
  },

  async getPlaybackIsPlaying() {
    try {
      const value = await this._evaluateDom('return ymDetectPlaybackIsPlaying();');
      if (value === null || value === undefined) return null;
      return !!value;
    } catch (err) {
      log.error('getPlaybackIsPlaying:', err);
      return null;
    }
  },

  async executeAction(buttonId, actionDescription) {
    try {
      log.info('Подключение к приложению Яндекс.Музыка');

      const client = await this.getClient();
      if (!client) {
        log.error('Не удалось получить CDP клиент');
        return false;
      }

      const { Runtime } = client;

      log.info(`Выполнение действия: ${actionDescription}`);

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
    }
  }
};
