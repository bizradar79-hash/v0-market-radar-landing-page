-- Groq's llama models are no longer accessible to our account
-- ("The model llama-3.3-70b-versatile does not exist or you do not have access").
-- Point every prompt_versions row that still uses Groq / a llama/mixtral model
-- at Gemini 2.5 Flash — the model the working modules use.
--
-- 1) Inspect first:
select id, module, version, is_active, model_provider, model_name
from prompt_versions
where model_provider = 'groq' or model_name ilike '%llama%' or model_name ilike '%mixtral%'
order by module, version;

-- 2) Fix:
update prompt_versions
set model_provider = 'gemini', model_name = 'gemini-2.5-flash'
where model_provider = 'groq' or model_name ilike '%llama%' or model_name ilike '%mixtral%';
