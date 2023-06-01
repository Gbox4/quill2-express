import MessageResponse from '~/interfaces/MessageResponse';

export default interface ErrorResponse extends MessageResponse {
  stack?: string;
}