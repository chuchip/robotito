import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'linebreaks'
})
export class LinebreaksPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return '';
    return value.replace(/\n/g, '<br>'); // Replace newlines with <br> for HTML
  }
}
