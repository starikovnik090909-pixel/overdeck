--[[
  Overdeck — автообновление источников «Браузер» в OBS.

  Установка: OBS → Инструменты → Скрипты → «+» → выбери этот файл.
  Дальше настройки появятся справа в окне скриптов.

  Что делает: раз в N минут обновляет (с очисткой кэша) источники «Браузер»,
  чьи адреса содержат заданный текст (по умолчанию localhost:3001 — оверлей Overdeck).
  Кнопка «Обновить сейчас» делает то же самое по требованию, а после запуска OBS
  и после перезапуска стрима/записи обновление выполняется само.
]]

local obs = obslua

local enabled      = true
local interval_min = 10
local url_filter   = "localhost:3001"
local on_start     = true
local skip_live    = false  -- не обновлять, пока идёт эфир (чтобы не обрывать алерт)

local function log(msg) obs.script_log(obs.LOG_INFO, msg) end

local function is_live()
  return obs.obs_frontend_streaming_active() or obs.obs_frontend_recording_active()
end

local function refresh_all(reason)
  local sources = obs.obs_enum_sources()
  if sources == nil then return end
  local n = 0
  for _, src in ipairs(sources) do
    if obs.obs_source_get_id(src) == "browser_source" then
      local settings = obs.obs_source_get_settings(src)
      local url = obs.obs_data_get_string(settings, "url") or ""
      obs.obs_data_release(settings)
      if url_filter == "" or string.find(url, url_filter, 1, true) then
        local props = obs.obs_source_properties(src)
        local btn = obs.obs_properties_get(props, "refreshnocache")
        if btn ~= nil then
          obs.obs_property_button_clicked(btn, src)
          n = n + 1
        end
        obs.obs_properties_destroy(props)
      end
    end
  end
  obs.source_list_release(sources)
  log(string.format("Обновлено источников: %d (%s)", n, reason or "по таймеру"))
end

local function on_timer()
  if not enabled then return end
  if skip_live and is_live() then return end
  refresh_all("по таймеру")
end

local function restart_timer()
  obs.timer_remove(on_timer)
  if enabled and interval_min > 0 then
    obs.timer_add(on_timer, math.floor(interval_min * 60 * 1000))
  end
end

local function on_event(event)
  if not enabled then return end
  if event == obs.OBS_FRONTEND_EVENT_FINISHED_LOADING and on_start then
    -- чуть подождать, пока загрузятся сцены
    obs.timer_add(function() obs.remove_current_callback(); refresh_all("запуск OBS") end, 3000)
  elseif event == obs.OBS_FRONTEND_EVENT_STREAMING_STARTED or event == obs.OBS_FRONTEND_EVENT_RECORDING_STARTED then
    refresh_all("старт эфира/записи")
  end
end

function script_description()
  return "<b>Overdeck — автообновление браузерных источников</b><br>" ..
         "Периодически обновляет источники «Браузер» с адресом, содержащим заданный текст " ..
         "(по умолчанию localhost:3001 — оверлей Overdeck). Пустой фильтр — обновлять все браузерные источники."
end

function script_properties()
  local p = obs.obs_properties_create()
  obs.obs_properties_add_bool(p, "enabled", "Включено")
  obs.obs_properties_add_float(p, "interval_min", "Как часто обновлять, минут (0 — выключить таймер)", 0, 240, 1)
  obs.obs_properties_add_text(p, "url_filter", "Обновлять источники, адрес которых содержит", obs.OBS_TEXT_DEFAULT)
  obs.obs_properties_add_bool(p, "on_start", "Обновлять при запуске OBS и старте эфира/записи")
  obs.obs_properties_add_bool(p, "skip_live", "Не обновлять по таймеру во время эфира/записи")
  obs.obs_properties_add_button(p, "now", "Обновить сейчас", function() refresh_all("кнопка"); return false end)
  return p
end

function script_defaults(s)
  obs.obs_data_set_default_bool(s, "enabled", true)
  obs.obs_data_set_default_double(s, "interval_min", 10)
  obs.obs_data_set_default_string(s, "url_filter", "localhost:3001")
  obs.obs_data_set_default_bool(s, "on_start", true)
  obs.obs_data_set_default_bool(s, "skip_live", false)
end

function script_update(s)
  enabled      = obs.obs_data_get_bool(s, "enabled")
  interval_min = obs.obs_data_get_double(s, "interval_min")
  url_filter   = obs.obs_data_get_string(s, "url_filter")
  on_start     = obs.obs_data_get_bool(s, "on_start")
  skip_live    = obs.obs_data_get_bool(s, "skip_live")
  restart_timer()
end

function script_load(s)
  obs.obs_frontend_add_event_callback(on_event)
end

function script_unload()
  obs.timer_remove(on_timer)
end
