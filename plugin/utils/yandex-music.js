const CDP = require('chrome-remote-interface');
const { log } = require('./plugin');

class YandexMusicController {
  constructor() {
    this.port = 9222;
    this.connected = false;
    this.client = null;
    this.connectionPromise = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 1000;
  }

  async setPort(newPort) {
    if (newPort === this.port) {
      log.info(`Порт не изменился (${newPort})`);
      return false;
    }

    log.info(`Изменение порта с ${this.port} на ${newPort}`);
    
    await this.disconnect();
    
    this.port = newPort;
    
    this.connected = false;
    this.connectionPromise = null;
    this.reconnectAttempts = 0;
    
    try {
      await this.connect();
      log.info(`Успешное подключение к новому порту ${newPort}`);
      return true;
    } catch (err) {
      log.error(`Ошибка при подключении к новому порту ${newPort}:`, err);
      return false;
    }
  }

  async connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise(async (resolve, reject) => {
      try {
        if (this.client) {
          log.info('Используем существующее CDP соединение');
          this.connected = true;
          resolve(this.client);
          return;
        }

        log.info('Создание нового CDP соединения на порту', this.port);
        this.client = await CDP({ port: this.port });
        
        await Promise.all([
          this.client.Page.enable(),
          this.client.Runtime.enable()
        ]);
        
        this.connected = true;
        this.reconnectAttempts = 0;
        
        this.client.on('disconnect', () => {
          log.error('CDP соединение разорвано, попытка переподключения...');
          this.connected = false;
          this.client = null;
          this.connectionPromise = null;
          this.reconnect();
        });
        
        log.info('CDP соединение успешно установлено');
        resolve(this.client);
      } catch (err) {
        this.connected = false;
        this.client = null;
        this.connectionPromise = null;
        
        if (err.message.includes('connect ECONNREFUSED')) {
          log.error('Не удалось подключиться к приложению Яндекс Музыка на порту', this.port);
          log.error('Убедитесь, что приложение запущено с параметром --remote-debugging-port=' + this.port);
        } else {
          log.error('Ошибка при создании CDP-клиента:', err);
        }
        
        reject(err);
      }
    });

    return this.connectionPromise;
  }

  async reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error(`Превышено максимальное количество попыток переподключения (${this.maxReconnectAttempts})`);
      return;
    }
    
    this.reconnectAttempts++;
    log.info(`Попытка переподключения ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
    
    setTimeout(async () => {
      try {
        await this.connect();
        log.info('Переподключение успешно выполнено');
      } catch (err) {
        log.error('Ошибка при переподключении:', err);
        this.reconnect();
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  async getClient() {
    try {
      return await this.connect();
    } catch (err) {
      log.error('Не удалось получить CDP клиент:', err);
      return null;
    }
  }

  async checkConnection() {
    try {
      const client = await this.getClient();
      return !!client;
    } catch (err) {
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
    try {
      log.info('Подключение к приложению Яндекс.Музыка');
      
      const client = await this.getClient();
      if (!client) {
        log.error('Не удалось получить CDP клиент');
        return false;
      }
      
      const { Runtime } = client;
      
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
    }
  }

  async executeAction(buttonId, actionDescription) {
    try {
      log.info('Подключение к приложению Яндекс.Музыка');
      
      const client = await this.getClient();
      if (!client) {
        log.error('Не удалось получить CDP клиент');
        return false;
      }
      
      const { Runtime } = client;
      
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
    }
  }

  async getTrackInfo() {
    try {
      log.info('Подключение к приложению Яндекс.Музыка');
      
      const client = await this.getClient();
      if (!client) {
        log.error('Не удалось получить CDP клиент');
        return null;
      }
      
      const { Runtime } = client;
      
      log.info('Получение информации о треке...');
      log.info('Выполнение JavaScript кода для поиска элементов трека...');
      
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
              
              const coverImg = playerBar.querySelector('img.PlayerBarDesktopWithBackgroundProgressBar_cover__MKmEt');
              const titleElement = playerBar.querySelector('[data-test-id="TRACK_TITLE"] .Meta_title__GGBnH');
              const artistElement = playerBar.querySelector('[data-test-id="SEPARATED_ARTIST_TITLE"] .Meta_artistCaption__JESZi');
              
              if (coverImg && titleElement && artistElement) {
                const originalCoverUrl = coverImg.src;
                const title = titleElement.textContent;
                const artist = artistElement.textContent;
                
                let coverUrl = originalCoverUrl;
                if (originalCoverUrl.includes('/100x100')) {
                  coverUrl = originalCoverUrl.replace('/100x100', '/400x400');
                  console.log("Увеличен размер обложки с 100x100 до 400x400");
                } else if (originalCoverUrl.includes('/200x200')) {
                  coverUrl = originalCoverUrl.replace('/200x200', '/400x400');
                  console.log("Увеличен размер обложки с 200x200 до 400x400");
                }
                
                console.log("Найдена информация о треке:", { title, artist, originalCoverUrl, coverUrl });
                
                return { 
                  success: true, 
                  coverUrl: coverUrl,
                  originalCoverUrl: originalCoverUrl,
                  title: title,
                  artist: artist
                };
              } else {
                console.log("Не удалось найти полную информацию о треке");
                return { 
                  success: false, 
                  message: 'Не удалось найти информацию о треке' 
                };
              }
            } catch (err) {
              return { 
                success: false, 
                message: 'Ошибка при получении информации о треке: ' + err.message,
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
          log.info('Информация о треке получена успешно:', value.title, 'от', value.artist);
          log.info('URL обложки:', value.coverUrl);
          return {
            coverUrl: value.coverUrl,
            title: value.title,
            artist: value.artist
          };
        } else {
          log.error('Не удалось получить информацию о треке:', value.message);
          log.error('Проверьте, что трек воспроизводится в Яндекс Музыке');
          
          if (value.error) {
            log.error('Детали ошибки:', value.error);
          }
          
          return null;
        }
      } else {
        log.error('Не удалось выполнить скрипт в контексте страницы');
        return null;
      }
    } catch (err) {
      log.error('Ошибка при выполнении скрипта:', err);
      return null;
    }
  }

  async getTrackTime() {
    try {
      log.info('Подключение к приложению Яндекс.Музыка');
      
      const client = await this.getClient();
      if (!client) {
        log.error('Не удалось получить CDP клиент');
        return null;
      }
      
      const { Runtime } = client;
      
      log.info('Получение информации о времени трека...');
      
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
              
              const currentTimeElement = playerBar.querySelector('[data-test-id="TIMECODE_TIME_START"]');
              const totalTimeElement = playerBar.querySelector('[data-test-id="TIMECODE_TIME_END"]');
              const progressSlider = playerBar.querySelector('[data-test-id="TIMECODE_SLIDER"]');
              
              if (currentTimeElement && totalTimeElement && progressSlider) {
                const currentTimeText = currentTimeElement.textContent.trim();
                const totalTimeText = totalTimeElement.textContent.trim();
                const progressValue = parseFloat(progressSlider.value) || 0;
                const progressMax = parseFloat(progressSlider.max) || 100;
                
                console.log("Найдена информация о времени:", { 
                  currentTimeText, 
                  totalTimeText, 
                  progressValue, 
                  progressMax 
                });
                
                return { 
                  success: true, 
                  currentTime: currentTimeText,
                  totalTime: totalTimeText,
                  progressValue: progressValue,
                  progressMax: progressMax,
                  progressPercent: (progressValue / progressMax) * 100
                };
              } else {
                console.log("Не удалось найти элементы времени трека");
                return { 
                  success: false, 
                  message: 'Не удалось найти элементы времени трека' 
                };
              }
            } catch (err) {
              return { 
                success: false, 
                message: 'Ошибка при получении времени трека: ' + err.message,
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
          log.info('Информация о времени трека получена успешно:', value.currentTime, '/', value.totalTime);
          return {
            currentTime: value.currentTime,
            totalTime: value.totalTime,
            progressValue: value.progressValue,
            progressMax: value.progressMax,
            progressPercent: value.progressPercent
          };
        } else {
          log.error('Не удалось получить информацию о времени трека:', value.message);
          
          if (value.error) {
            log.error('Детали ошибки:', value.error);
          }
          
          return null;
        }
      } else {
        log.error('Не удалось выполнить скрипт в контексте страницы');
        return null;
      }
    } catch (err) {
      log.error('Ошибка при выполнении скрипта:', err);
      return null;
    }
  }

  async toggleMute() {
    try {
      log.info('Подключение к приложению Яндекс.Музыка');
      
      const client = await this.getClient();
      if (!client) {
        log.error('Не удалось получить CDP клиент');
        return false;
      }
      
      const { Runtime } = client;
      
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
    }
  }
  
  async disconnect() {
    if (this.client) {
      try {
        await this.client.close();
        log.info('CDP соединение закрыто');
      } catch (err) {
        log.error('Ошибка при закрытии CDP соединения:', err);
      } finally {
        this.client = null;
        this.connected = false;
        this.connectionPromise = null;
      }
    }
  }
}

const yandexMusicController = new YandexMusicController();
module.exports = yandexMusicController; 