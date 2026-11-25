import { parseLawTextToItems, parseUploadedQuestions } from '../lib/parsers';
import { LawItem, Question } from '../types/study';

export type ParserWorkerRequest =
  | {
      id: string;
      type: 'parseLawTextToItems';
      fileName: string;
      rawText: string;
    }
  | {
      id: string;
      type: 'parseUploadedQuestions';
      text: string;
      defaultSubject: string;
    };

export type ParserWorkerResponse =
  | {
      id: string;
      ok: true;
      type: 'parseLawTextToItems';
      result: LawItem[];
    }
  | {
      id: string;
      ok: true;
      type: 'parseUploadedQuestions';
      result: Question[];
    }
  | {
      id: string;
      ok: false;
      error: string;
    };

self.onmessage = (event: MessageEvent<ParserWorkerRequest>) => {
  const req = event.data;
  try {
    if (req.type === 'parseLawTextToItems') {
      const result = parseLawTextToItems(req.fileName, req.rawText);
      const res: ParserWorkerResponse = {
        id: req.id,
        ok: true,
        type: 'parseLawTextToItems',
        result,
      };
      self.postMessage(res);
      return;
    }

    if (req.type === 'parseUploadedQuestions') {
      const result = parseUploadedQuestions(req.text, req.defaultSubject);
      const res: ParserWorkerResponse = {
        id: req.id,
        ok: true,
        type: 'parseUploadedQuestions',
        result,
      };
      self.postMessage(res);
      return;
    }
  } catch (err) {
    const res: ParserWorkerResponse = {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err || 'Erro no parser em segundo plano'),
    };
    self.postMessage(res);
  }
};
