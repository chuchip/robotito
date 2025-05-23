import { Injectable } from '@angular/core';
import { securityDTO } from '../model/security.dto';

@Injectable()
export class PersistenceService {
  private security: securityDTO={'user':'','authorization':''}
  public uuid:string="";
  public clearLogin=false  
  public showSummary=false;

  constructor() {
    this.uuid = this.generateUuid();
   }
  setAuthorization(authorization: string) {
    this.security.authorization=authorization 
  }
  setUser(user:string)
  {
    this.security.user=user
  }
  getUser():string 
  {
    return this.security.user
  }
  getAuthorization(): string {
    if (! this.security)
      return ""
    if (! this.security.authorization)
      return "" 
    return  this.security.authorization 
  }
  private generateUuid(): string {
    // Generate a random UUID (version 4)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
 /**
   * Expires default 1 day
   * If params.session is set and true expires is not added
   * If params.path is not set or value is not greater than 0 its default value will be root "/"
   * Secure flag can be activated only with https implemented
   * Examples of usage:
   * {service instance}.setCookie({name:'token',value:'abcd12345', session:true }); <- This cookie will not expire
   * {service instance}.setCookie({name:'userName',value:'John Doe', secure:true }); <- If page is not https then secure will not apply
   * {service instance}.setCookie({name:'niceCar', value:'red', expireDays:10 }); <- For all this examples if path is not provided default will be root
   */
 public setCookie(params: any) {
  let d: Date = new Date();
  d.setTime(
    d.getTime() +
      (params.expireDays ? params.expireDays : 1) * 24 * 60 * 60 * 1000
  );
  document.cookie =
    (params.name ? params.name : '') +
    '=' +
    (params.value ? params.value : '') +
    ';' +
    (params.session && params.session == true
      ? ''
      : 'expires=' + d.toUTCString() + ';') +
    'path=' +
    (params.path && params.path.length > 0 ? params.path : '/') +
    ';' +
    (location.protocol === 'https:' && params.secure && params.secure == true
      ? 'secure'
      : '');
}
  public getCookie(name: string) {
    let ca: Array<string> = document.cookie.split(';');
    console.log(document.cookie);
    let caLen: number = ca.length;
    let cookieName = `${name}=`;
    let c: string;

    for (let i: number = 0; i < caLen; i += 1) {
      c = ca[i].replace(/^\s+/g, '');
      if (c.indexOf(cookieName) == 0) {
        return c.substring(cookieName.length, c.length);
      }
    }
    return '';
  }

  public deleteCookie(cookieName:string) {
    this.setCookie({ name: cookieName, value: '', expireDays: -1 });
  }
}
