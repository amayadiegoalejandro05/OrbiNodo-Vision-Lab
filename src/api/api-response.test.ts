import { describe, expect, it } from 'vitest';
import { apiFailure, ApiRequestError } from './api-response';

describe('contrato común del cliente API', () => {
  it('conserva código y mensaje del backend', () => {
    const error = apiFailure({ error: 'CAMERA_NOT_FOUND', message: 'No existe.' }, 'Error');
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ code: 'CAMERA_NOT_FOUND', message: 'No existe.' });
  });

  it('usa un mensaje seguro para una respuesta inválida', () => {
    expect(apiFailure('<html>', 'Error controlado')).toMatchObject({
      code: undefined, message: 'Error controlado',
    });
  });
});
