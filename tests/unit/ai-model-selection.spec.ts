import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const gateway=vi.hoisted(()=>vi.fn((model:string)=>model));
const generateText=vi.hoisted(()=>vi.fn());
vi.mock("ai",()=>({gateway,generateText}));
import { callModel } from "@/lib/ai/model";
beforeEach(()=>{
 vi.stubEnv("ANTHROPIC_API_KEY","");vi.stubEnv("AI_GATEWAY_API_KEY","fixture");
 vi.stubEnv("NATURE_CLASS_AI_MODEL","anthropic/fixture-default");
 generateText.mockResolvedValue({text:"fixture response",usage:{inputTokens:1,outputTokens:2}});
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
describe("server-owned per-call model selection",()=>{
 it("uses a per-call model and timeout without changing subsequent hint calls",async()=>{
  await callModel({system:"fixture",user:"fixture",model:"anthropic/fixture-composer",timeoutMs:45000,maxTokens:800});
  expect(generateText).toHaveBeenLastCalledWith(expect.objectContaining({model:"anthropic/fixture-composer",timeout:45000,maxOutputTokens:800,maxRetries:0}));
  await callModel({system:"fixture",user:"fixture"});
  expect(generateText).toHaveBeenLastCalledWith(expect.objectContaining({model:"anthropic/fixture-default",timeout:8000,maxOutputTokens:400}));
 });
 it("routes an explicit Anthropic model to the existing direct transport",async()=>{
  vi.stubEnv("ANTHROPIC_API_KEY","fixture");
  const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>({content:[{type:"text",text:"fixture"}]})});vi.stubGlobal("fetch",fetch);
  const result=await callModel({system:"fixture",user:"fixture",model:"anthropic/claude-sonnet-4.5"});
  expect(result?.model).toBe("claude-sonnet-4-5");expect(JSON.parse(fetch.mock.calls[0]![1].body).model).toBe("claude-sonnet-4-5");
  expect(generateText).not.toHaveBeenCalled();
 });
 it("refuses invalid overrides before inference",async()=>{
  await expect(callModel({system:"fixture",user:"fixture",model:"missing-provider"})).rejects.toThrow("provider");
  await expect(callModel({system:"fixture",user:"fixture",timeoutMs:0})).rejects.toThrow("positive");
  await expect(callModel({system:"fixture",user:"fixture",timeoutMs:2_147_483_648})).rejects.toThrow("timer range");
  expect(generateText).not.toHaveBeenCalled();
 });
});
